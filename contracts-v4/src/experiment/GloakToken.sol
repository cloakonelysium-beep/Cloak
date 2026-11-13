// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

/**
 * @title GloakToken
 * @notice Cloak's one private-only token experiment (docs/GLOAK-EXPERIMENT.md). It is meant to live in private vaults
 *         and be traded only through private routers. Bringing it in and trading it privately are free; taking it out
 *         to a public address, or moving it between public addresses, burns a surcharge (10%, never raised).
 *
 *         The token keeps a list of approved contracts, each with roles:
 *          - RECEIVE  receives for free (vaults, routers, batch rounds, the hook);
 *          - SEND     sends to anyone for free (the launch's auction, which pays bidders; the hook);
 *          - FEED     may send into Uniswap's PoolManager (the hook, routers, batch rounds). Nobody else can, so nobody
 *                     outside the private zone can sell into a pool, add liquidity, or turn tokens into v4 claims;
 *          - SWAP     may swap in GLOAK's own pool (the hook asks canSwap): routers that always deliver into a vault;
 *          - VAULT    a private vault. Its withdrawals pay the surcharge, unless the recipient is a one-time swap
 *                     escrow that hands everything to a PAYEE in the same transaction (a private sell): then the
 *                     surcharge goes on to the PAYEE, so the swap gets the full amount;
 *          - PAYEE    a router or batch round that one-time escrows pay (it receives that refund).
 *
 *         The admin (Cloak's owner wallet) sets roles at once during setup. After endSetup, adding a role waits 3 days
 *         in public; removing one is instant. The surcharge can only be lowered. What the admin may grant is limited,
 *         in setup too: SEND never (only the launch's auction and the hook have it, from the constructor), and FEED or
 *         SWAP only to an address with code, since those open Uniswap. RECEIVE, VAULT and PAYEE may go to any address:
 *         they make arriving free, never leaving, so what an approved address sends on to a public one still pays.
 *
 *         Supply is fixed at launch and only ever falls: nothing is minted after the constructor. A vault withdrawal's
 *         surcharge isn't burned on the spot but held by the token itself (balanceOf[address(this)]) and owed to the
 *         withdrawal's recipient, because a one-time swap escrow can't be recognised in advance. The recipient's first
 *         outgoing transfer settles it: if that transfer hands its whole balance to a PAYEE, the held surcharge moves
 *         on to the PAYEE as a plain transfer (a private sell, so the swap gets the full amount); any other transfer
 *         makes it burnable. A recipient that never moves its GLOAK can be released by anyone after OWED_WINDOW.
 *         Burnable surcharges are burned by the next transfer of GLOAK, or by anyone with burnHeld(). Every other
 *         surcharge burns at once.
 *
 * @dev What is owed is kept in storage, not only for the withdrawal's transaction, so a withdrawal sent alone (someone
 *      copying a pending swap's proof and spending it first) can't make the surcharge burn: the escrow still hands its
 *      whole balance to the router later, in the swap or its rescue, and the surcharge follows. A zero-value transfer
 *      never settles what is owed (it needs no allowance, so anyone could send one).
 */
contract GloakToken {
    string public name;
    string public symbol;
    uint8 public constant decimals = 18;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    uint8 public constant RECEIVE = 1;
    uint8 public constant SEND = 2;
    uint8 public constant FEED = 4;
    uint8 public constant SWAP = 8;
    uint8 public constant VAULT = 16;
    uint8 public constant PAYEE = 32;
    uint8 internal constant ALL_ROLES = 63;

    /// @notice The surcharge's ceiling: 10%. It starts there and can only go down.
    uint16 public constant MAX_SURCHARGE_BPS = 1_000;
    /// @notice How long a new role waits after setup.
    uint256 public constant ROLE_DELAY = 3 days;
    /// @notice A queued role change must be applied within this long after it becomes due, or it expires.
    uint256 public constant ROLE_GRACE = 14 days;
    /// @notice After this long, what a withdrawal's recipient is still owed may be released (made burnable) by anyone.
    uint256 public constant OWED_WINDOW = 14 days;
    address public constant DEAD = 0x000000000000000000000000000000000000dEaD;

    /// @notice Uniswap v4's PoolManager: only FEED contracts may send GLOAK into it.
    address public immutable poolManager;

    address public admin;
    address public pendingAdmin;
    bool public setupMode = true;
    uint16 public surchargeBps = MAX_SURCHARGE_BPS;
    /// @notice GLOAK burned by surcharges so far (heldForBurn() is on its way there).
    uint256 public surchargeBurned;

    mapping(address => uint8) public rolesOf;
    /// @notice Every address that ever had a role (for the privacy meter).
    address[] public members;
    mapping(address => bool) internal _isMember;
    /// @notice A queued role change (keccak256(account, roles)) → when it may be applied (until ROLE_GRACE after).
    mapping(bytes32 => uint256) public queuedAt;
    /// @notice The account's code hash when the change was queued (0 for an account with no code then): applying it
    ///         requires the same code, so what was reviewed during the wait is what gets the roles.
    mapping(bytes32 => bytes32) public queuedCodehash;

    /// @notice A vault withdrawal's surcharge, held by the token and owed to its recipient until it settles.
    struct Owed {
        uint192 amount;
        uint64 since;
    }

    mapping(address => Owed) public owed;
    /// @notice The total held for recipients (not burnable until each one settles).
    uint256 public totalOwed;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event RolesSet(address indexed account, uint8 roles);
    event RolesQueued(address indexed account, uint8 roles, uint256 eta);
    event RolesCancelled(address indexed account, uint8 roles);
    event SetupEnded();
    event SurchargeLowered(uint16 bps);
    event Surcharged(address indexed from, address indexed to, uint256 burned);
    event SurchargeRefunded(address indexed escrow, address indexed payee, uint256 amount);
    event SurchargeHeld(address indexed from, address indexed to, uint256 amount);
    event OwedReleased(address indexed recipient, uint256 amount);
    event AdminOffered(address indexed to);
    event AdminChanged(address indexed to);

    error NotAdmin();
    error NotPrivate();
    error TimelockRequired();
    error NotQueued();
    error TooEarly();
    error SetupEnded_();
    error BadSurcharge();
    error BadRoles();
    /// @notice The admin can never grant SEND, and grants FEED or SWAP only to contracts.
    error RoleNotGrantable();
    error ZeroAddress();
    /// @notice Nobody sends GLOAK to the token itself: its balance is only surcharges waiting to burn.
    error ToToken();
    error Expired();
    error CodeChanged();
    error NotYet();
    error Balance();
    error Allowance();

    modifier onlyAdmin() {
        if (msg.sender != admin) revert NotAdmin();
        _;
    }

    /**
     * @param to, amounts the whole supply, as CloakToken mints it (the factory passes the launch's auction). Each holder
     *        here gets RECEIVE and SEND, so the auction can pay bidders and take back what the pool didn't use.
     * @param hook Cloak's v4 hook: it seeds the pool and collects its fees (RECEIVE, SEND, FEED).
     * @param zone, zoneRoles the private zone GLOAK is born with (the launch vault, the router, batch rounds, private
     *        bids), so nothing depends on approving them in time. The same limits as the admin's apply: no SEND, and
     *        FEED or SWAP only to contracts.
     */
    constructor(
        string memory name_,
        string memory symbol_,
        address[] memory to,
        uint256[] memory amounts,
        address admin_,
        address poolManager_,
        address hook,
        address[] memory zone,
        uint8[] memory zoneRoles
    ) {
        if (admin_ == address(0) || poolManager_ == address(0) || hook == address(0)) revert ZeroAddress();
        require(to.length == amounts.length && zone.length == zoneRoles.length, "len");
        name = name_;
        symbol = symbol_;
        admin = admin_;
        poolManager = poolManager_;
        for (uint256 i; i < to.length; ++i) {
            if (amounts[i] == 0) continue;
            _setRoles(to[i], RECEIVE | SEND);
            totalSupply += amounts[i];
            balanceOf[to[i]] += amounts[i];
            emit Transfer(address(0), to[i], amounts[i]);
        }
        _setRoles(hook, RECEIVE | SEND | FEED);
        for (uint256 i; i < zone.length; ++i) {
            if (zoneRoles[i] > ALL_ROLES) revert BadRoles();
            _checkGrant(zone[i], zoneRoles[i] & ~rolesOf[zone[i]]);
            _setRoles(zone[i], zoneRoles[i] | rolesOf[zone[i]]);
        }
    }

    // ───────────────────────────── ERC-20 ─────────────────────────────

    function approve(address spender, uint256 value) external returns (bool) {
        allowance[msg.sender][spender] = value;
        emit Approval(msg.sender, spender, value);
        return true;
    }

    function transfer(address to, uint256 value) external returns (bool) {
        _transfer(msg.sender, to, value);
        return true;
    }

    function transferFrom(address from, address to, uint256 value) external returns (bool) {
        uint256 a = allowance[from][msg.sender];
        if (a != type(uint256).max) {
            if (a < value) revert Allowance();
            allowance[from][msg.sender] = a - value;
        }
        _transfer(from, to, value);
        return true;
    }

    // ───────────────────────────── the rule ─────────────────────────────

    /// @notice Whether `swapper` may swap in GLOAK's pool (asked by Cloak's v4 hook before every swap there).
    function canSwap(address swapper) external view returns (bool) {
        return rolesOf[swapper] & SWAP != 0;
    }

    /// @notice What a transfer of `value` from `from` to `to` would burn right now (ignoring a same-transaction refund).
    function surchargeOn(address from, address to, uint256 value) public view returns (uint256) {
        if (to == poolManager || to == DEAD) return 0;
        if (rolesOf[to] & RECEIVE != 0 || rolesOf[from] & SEND != 0) return 0;
        return (value * surchargeBps) / 10_000;
    }

    /// @notice Surcharges held by the token and owed to nobody: burned by the next transfer.
    function heldForBurn() public view returns (uint256) {
        return balanceOf[address(this)] - totalOwed;
    }

    /// @notice Make what `recipient` is owed burnable, once OWED_WINDOW has passed since it was last added to. Anyone may.
    function releaseOwed(address recipient) external {
        Owed memory o = owed[recipient];
        if (o.amount == 0 || block.timestamp < uint256(o.since) + OWED_WINDOW) revert NotYet();
        _release(recipient, o.amount);
        _burnHeld();
    }

    function _release(address recipient, uint256 amount) private {
        delete owed[recipient];
        totalOwed -= amount;
        emit OwedReleased(recipient, amount);
    }

    /// @notice Burn what the token holds from past withdrawals' surcharges now. Anyone may call it.
    function burnHeld() external {
        _burnHeld();
    }

    function _burnHeld() private {
        uint256 h = heldForBurn();
        if (h == 0) return;
        balanceOf[address(this)] -= h;
        totalSupply -= h;
        surchargeBurned += h;
        emit Transfer(address(this), address(0), h);
    }

    function _transfer(address from, address to, uint256 value) internal {
        if (to == address(0)) revert ZeroAddress();
        if (to == address(this)) revert ToToken();
        _burnHeld();
        if (balanceOf[from] < value) revert Balance();
        uint256 owedFrom = value == 0 ? 0 : owed[from].amount;
        if (_route(from, to, value, owedFrom) || owedFrom == 0) return;
        // the recipient of a withdrawal moved its GLOAK some other way: its held surcharge burns
        _release(from, owedFrom);
        _burnHeld();
    }

    /// @dev Moves `value` under the rule. Returns whether `from`'s owed surcharge went on to a PAYEE.
    function _route(address from, address to, uint256 value, uint256 owedFrom) private returns (bool refunded) {
        uint8 rf = rolesOf[from];

        // into Uniswap: only the private zone's own contracts
        if (to == poolManager) {
            if (rf & FEED == 0) revert NotPrivate();
            _move(from, to, value);
            return false;
        }

        uint8 rt = rolesOf[to];
        if (to == DEAD || rt & RECEIVE != 0) {
            _move(from, to, value);
            // a one-time escrow handing all of a vault withdrawal to a router or batch round: the surcharge the token
            // holds for it goes on to the router too (a transfer, never a mint)
            if (owedFrom != 0 && rt & PAYEE != 0 && balanceOf[from] == 0) {
                delete owed[from];
                totalOwed -= owedFrom;
                _move(address(this), to, owedFrom);
                emit SurchargeRefunded(from, to, owedFrom);
                return true;
            }
            return false;
        }
        if (rf & SEND != 0) {
            _move(from, to, value);
            return false;
        }

        // out of the private zone, or between public addresses
        uint256 cut = (value * surchargeBps) / 10_000;
        _move(from, to, value - cut);
        if (cut == 0) return false;
        if (rf & VAULT != 0) {
            // a vault's withdrawal: held and owed to `to`, in case it is a swap's one-time escrow
            _move(from, address(this), cut);
            Owed storage o = owed[to];
            o.amount += uint192(cut);
            o.since = uint64(block.timestamp);
            totalOwed += cut;
            emit SurchargeHeld(from, to, cut);
        } else {
            balanceOf[from] -= cut;
            totalSupply -= cut;
            surchargeBurned += cut;
            emit Transfer(from, address(0), cut);
            emit Surcharged(from, to, cut);
        }
        return false;
    }

    function _move(address from, address to, uint256 value) private {
        unchecked {
            balanceOf[from] -= value;
        }
        balanceOf[to] += value;
        emit Transfer(from, to, value);
    }

    // ───────────────────────────── the privacy meter ─────────────────────────────

    /**
     * @notice Where GLOAK is: in private vaults, in Uniswap's PoolManager (the pool), in other approved contracts,
     *         burned at 0x…dEaD, and in public addresses (the rest). `privateBps` is the vaults' share of everything not
     *         burned, in basis points. Surcharges the token holds until they burn count as none of these.
     */
    function meter()
        external
        view
        returns (uint256 inVaults, uint256 inPool, uint256 inContracts, uint256 atDead, uint256 inPublic, uint256 privateBps)
    {
        for (uint256 i; i < members.length; ++i) {
            address m = members[i];
            if (m == poolManager || m == DEAD) continue;
            if (rolesOf[m] & VAULT != 0) inVaults += balanceOf[m];
            else inContracts += balanceOf[m];
        }
        inPool = balanceOf[poolManager];
        atDead = balanceOf[DEAD];
        uint256 held = balanceOf[address(this)];
        inPublic = totalSupply - held - inVaults - inPool - inContracts - atDead;
        uint256 live = totalSupply - held - atDead;
        privateBps = live == 0 ? 0 : (inVaults * 10_000) / live;
    }

    function membersCount() external view returns (uint256) {
        return members.length;
    }

    // ───────────────────────────── admin ─────────────────────────────

    /// @notice Set `account`'s roles. In setup: at once. After: at once only if it removes roles; adding waits (queueRoles).
    function setRoles(address account, uint8 roles) external onlyAdmin {
        if (roles > ALL_ROLES) revert BadRoles();
        uint8 added = roles & ~rolesOf[account];
        if (added != 0) {
            if (!setupMode) revert TimelockRequired();
            _checkGrant(account, added);
        }
        _setRoles(account, roles);
    }

    /// @notice After setup: announce a role change that adds roles; it may be applied ROLE_DELAY later.
    function queueRoles(address account, uint8 roles) external onlyAdmin returns (uint256 eta) {
        if (roles > ALL_ROLES || account == address(0) || account == address(this)) revert BadRoles();
        // checked now too, so the code to review during the wait already exists
        _checkGrant(account, roles & ~rolesOf[account]);
        eta = block.timestamp + ROLE_DELAY;
        bytes32 id = keccak256(abi.encode(account, roles));
        queuedAt[id] = eta;
        queuedCodehash[id] = account.code.length == 0 ? bytes32(0) : account.codehash;
        emit RolesQueued(account, roles, eta);
    }

    function applyRoles(address account, uint8 roles) external onlyAdmin {
        bytes32 id = keccak256(abi.encode(account, roles));
        uint256 eta = queuedAt[id];
        if (eta == 0) revert NotQueued();
        if (block.timestamp < eta) revert TooEarly();
        if (block.timestamp > eta + ROLE_GRACE) revert Expired();
        bytes32 h = queuedCodehash[id];
        if (h != bytes32(0) && account.codehash != h) revert CodeChanged();
        delete queuedAt[id];
        delete queuedCodehash[id];
        _checkGrant(account, roles & ~rolesOf[account]);
        _setRoles(account, roles);
    }

    /// @dev What the admin may add: never SEND; FEED and SWAP only to a contract, and not to a wallet delegating to code
    ///      (EIP-7702, code 0xef0100 ‖ address), which a key still controls. Checked when queued and when applied.
    function _checkGrant(address account, uint8 added) private view {
        if (added & SEND != 0) revert RoleNotGrantable();
        if (added & (FEED | SWAP) != 0) {
            if (account.code.length == 0) revert RoleNotGrantable();
            if (account.code.length == 23 && bytes3(account.code) == 0xef0100) revert RoleNotGrantable();
        }
    }

    function cancelRoles(address account, uint8 roles) external onlyAdmin {
        bytes32 id = keccak256(abi.encode(account, roles));
        if (queuedAt[id] == 0) revert NotQueued();
        delete queuedAt[id];
        delete queuedCodehash[id];
        emit RolesCancelled(account, roles);
    }

    /// @notice End setup, for good: from now on, new roles wait ROLE_DELAY in public.
    function endSetup() external onlyAdmin {
        if (!setupMode) revert SetupEnded_();
        setupMode = false;
        emit SetupEnded();
    }

    /// @notice Lower the surcharge (never raise it).
    function lowerSurcharge(uint16 bps) external onlyAdmin {
        if (bps >= surchargeBps) revert BadSurcharge();
        surchargeBps = bps;
        emit SurchargeLowered(bps);
    }

    function offerAdmin(address to) external onlyAdmin {
        pendingAdmin = to;
        emit AdminOffered(to);
    }

    function acceptAdmin() external {
        if (msg.sender != pendingAdmin || msg.sender == address(0)) revert NotAdmin();
        admin = msg.sender;
        pendingAdmin = address(0);
        emit AdminChanged(msg.sender);
    }

    /// @notice Give up the admin for good: roles and the surcharge are then frozen as they are.
    function renounceAdmin() external onlyAdmin {
        admin = address(0);
        pendingAdmin = address(0);
        emit AdminChanged(address(0));
    }

    function _setRoles(address account, uint8 roles) private {
        if (account == address(0)) revert ZeroAddress();
        if (account == address(this)) revert BadRoles(); // its balance is held surcharges, never a member's
        rolesOf[account] = roles;
        if (!_isMember[account]) {
            _isMember[account] = true;
            members.push(account);
        }
        emit RolesSet(account, roles);
    }
}

/// @notice The door's maker: CloakVestingDeployer's one-time door calls make() for the GLOAK launch.
/// @dev The private zone is fixed here, at the maker's deploy, so GLOAK is born with it: the launch vault (Receive,
///      Vault), the router (Receive, Feed, Swap, Payee), batch rounds (Receive, Feed, Payee) and private bids (Receive).
contract GloakMaker {
    address public immutable door;
    address public immutable admin;
    address public immutable poolManager;
    address public immutable hook;
    address[] internal _zone;
    uint8[] internal _zoneRoles;

    constructor(address door_, address admin_, address poolManager_, address hook_, address[] memory zone, uint8[] memory zoneRoles) {
        require(zone.length == zoneRoles.length, "len");
        door = door_;
        admin = admin_;
        poolManager = poolManager_;
        hook = hook_;
        _zone = zone;
        _zoneRoles = zoneRoles;
    }

    /// @notice The contracts GLOAK will be born approved, and their roles.
    function zone() external view returns (address[] memory, uint8[] memory) {
        return (_zone, _zoneRoles);
    }

    function make(string calldata name, string calldata symbol, address[] calldata to, uint256[] calldata amounts)
        external
        returns (address)
    {
        require(msg.sender == door, "door only");
        return address(new GloakToken(name, symbol, to, amounts, admin, poolManager, hook, _zone, _zoneRoles));
    }
}
