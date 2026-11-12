// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test, Vm, console} from "forge-std/Test.sol";
import {IPoolManager} from "v4-core/interfaces/IPoolManager.sol";
import {PoolKey as V4Key} from "v4-core/types/PoolKey.sol";
import {Currency} from "v4-core/types/Currency.sol";
import {PoolKey} from "gloam/GloamVaultSwapV4.sol";
import {GloamVaultSwapV4c} from "gloam/GloamVaultSwapV4c.sol";
import {GloamVaultSwap2} from "gloam/GloamVaultSwap2.sol";
import {CloakConfig} from "cloak/CloakConfig.sol";
import {CloakFactory} from "cloak/CloakFactory.sol";
import {CloakAuction, IMarketSeeder, IFeeLocker} from "cloak/CloakAuction.sol";
import {CloakVestingDeployer} from "cloak/CloakVesting.sol";
import {CloakV4Hook, ICloakLaunchFactory} from "../src/CloakV4Hook.sol";
import {CloakV4Market} from "../src/CloakV4Market.sol";
import {GloakToken, GloakMaker} from "../src/experiment/GloakToken.sol";

interface IGloamVaultT {
    function verifier() external view returns (address);
    function shieldVerifier() external view returns (address);
    function currentRoot() external view returns (bytes32);
    function deposited(address) external view returns (uint256);
    function feesOwed(address) external view returns (uint256);
    function withdrawFeeBps() external view returns (uint16);
    function shieldBound(address asset, uint256 amount, bytes32 commitment, bytes calldata proof) external payable;
    function unshield(bytes calldata proof, bytes32 root, bytes32 nullifier, address asset, address to, uint256 amount) external;
    function setDepositLimit(address asset, uint128 perDeposit, uint128 total) external;
}

interface IVerifierT {
    function verify(bytes calldata proof, uint256[] calldata inputs) external view returns (bool);
}

interface IGuardT {
    function controller() external view returns (address);
    function queueChange(bytes calldata call) external returns (bytes32, uint256);
    function executeChange(bytes calldata call) external;
}

/**
 * GLOAK inside GLOAM, on a fork of Elysium mainnet: Gloam's real vault (as deployed, at its address, with its owner
 * guard, deposit limits and 0.5% cash-out fee) and Gloam's own v4 swap router, GloamVaultSwapV4c, unmodified (Gloam
 * hasn't deployed a router on Elysium yet, so we deploy their code as they would). GLOAK is launched through Cloak's
 * door on Uniswap's real PoolManager.
 *
 * The integration is only approvals: Gloam lists GLOAK in its vault through its own 3-day timelock, Cloak approves
 * Gloam's vault (Receive, Vault) and router (Receive, Feed, Swap, Payee) on GLOAK through GLOAK's 3-day timelock, and
 * Gloam's router allows GLOAK's pool. No line of Gloam's code changes.
 *
 * The one stand-in: Gloam's proof checkers answer yes (vm.mockCall), so this needs no prover. Real proofs on this same
 * vault are part 22's (e2e-gloam/part22-mainnet-fork.mjs); here the subject is what the token, vault, escrow and router
 * do with each other.
 *
 *   MAINNET_RPC=https://rpc.elysium.kinetiq.xyz forge test --match-contract GloakOnGloam -vv
 * Skipped without MAINNET_RPC.
 */
contract GloakOnGloam is Test {
    IPoolManager constant PM = IPoolManager(0xE2e105d3F7209A9DA11f83cCf3E7398a753823F1);
    IGloamVaultT constant GVAULT = IGloamVaultT(0x89d3042390204f57b8b4F8949D3c2203E4002164);
    IGuardT constant GGUARD = IGuardT(0x268D7CAd645282D1e77461b5B2dd997bd54eFAf5);
    address constant GTREASURY = 0xB3900ac9350903218e4c7597bAb0f008F01B30B8;
    address constant WHYPE = 0xbA876237B0F021A6c6D852d6c26E107997cC5E81; // Elysium mainnet's WHYPE
    uint160 constant FLAGS = (1 << 13) | (1 << 11) | (1 << 9) | (1 << 7);
    address constant NATIVE = address(0);

    uint8 constant RECEIVE = 1;
    uint8 constant FEED = 4;
    uint8 constant SWAP = 8;
    uint8 constant VAULT = 16;
    uint8 constant PAYEE = 32;

    bool forked;
    CloakV4Hook hook;
    CloakFactory factory;
    CloakVestingDeployer deployer;
    CloakAuction auction;
    GloakToken gloak;
    CloakV4Market market;
    GloamVaultSwapV4c gRouter;

    address admin = makeAddr("Cloak owner wallet");
    address gloamOwner = makeAddr("Gloam's router owner");
    address ada = makeAddr("ada");
    address bob = makeAddr("bob");
    uint256 nonce;

    function setUp() public {
        string memory rpc = vm.envOr("MAINNET_RPC", string(""));
        if (bytes(rpc).length == 0) return;
        vm.createSelectFork(rpc);
        require(block.chainid == 99901, "not Elysium mainnet");
        forked = true;

        // GLOAK through Cloak's door, on Uniswap's real PoolManager, born with no private zone (approved below, as a
        // partner would be after launch)
        CloakConfig config = new CloakConfig(address(1), address(0));
        config.setFees(0, 150, makeAddr("Cloak treasury"));
        hook = _deployHook();
        deployer = new CloakVestingDeployer(admin);
        factory = new CloakFactory(config, deployer, IMarketSeeder(address(hook)), IFeeLocker(address(0)));
        hook.setFactory(ICloakLaunchFactory(address(factory)));
        GloakMaker maker = new GloakMaker(address(deployer), admin, address(PM), address(hook), new address[](0), new uint8[](0));
        vm.prank(admin);
        deployer.useDoor(address(maker), address(factory), abi.encodeCall(CloakFactory.createLaunch, ("GLOAK", "GLOAK", 0, 0, _params(), "")));
        (address a, address t,,,,) = factory.launches(0);
        auction = CloakAuction(payable(a));
        gloak = GloakToken(t);

        // one public bid, settled: ada holds public GLOAK, and the pool opens
        vm.deal(ada, 10 ether);
        bytes32 salt = keccak256("ada");
        bytes32 commitment = auction.commitmentOf(ada, 0, uint128(150_000e18), salt);
        vm.prank(ada);
        uint256 id = auction.commit{value: 2 ether}(commitment, "");
        (,,,,,, uint64 commitEnd, uint64 revealEnd,,,,,) = auction.params();
        vm.warp(commitEnd);
        auction.reveal(id, 0, uint128(150_000e18), salt);
        vm.warp(revealEnd);
        auction.settle();
        auction.claim(id);
        market = CloakV4Market(payable(address(auction.pair())));
        vm.warp(vm.getBlockTimestamp() + 600); // past the hook's anti-snipe window

        // Gloam's router, Gloam's code as is, allowing GLOAK's pool from its deploy
        V4Key memory v = hook.keyFor(address(gloak));
        PoolKey[] memory pools = new PoolKey[](1);
        pools[0] = _gk(v);
        gRouter = new GloamVaultSwapV4c(address(GVAULT), GTREASURY, address(PM), WHYPE, gloamOwner, pools);

        // Gloam lists GLOAK (and HYPE, as it plans) in its real vault, through the vault guard's own 3-day timelock
        address ctl = GGUARD.controller();
        bytes memory listGloak = abi.encodeCall(IGloamVaultT.setDepositLimit, (address(gloak), uint128(100_000e18), uint128(1_000_000e18)));
        bytes memory listHype = abi.encodeCall(IGloamVaultT.setDepositLimit, (NATIVE, uint128(12 ether), uint128(600 ether)));
        vm.startPrank(ctl);
        GGUARD.queueChange(listGloak);
        try GGUARD.queueChange(listHype) {} catch {} // Gloam may have queued HYPE already
        vm.warp(vm.getBlockTimestamp() + 3 days + 60);
        GGUARD.executeChange(listGloak);
        try GGUARD.executeChange(listHype) {} catch {} // or already executed it
        vm.stopPrank();

        // Cloak approves Gloam's vault and router on GLOAK, after setup: 3 days in public
        vm.startPrank(admin);
        gloak.endSetup();
        gloak.queueRoles(address(GVAULT), RECEIVE | VAULT);
        gloak.queueRoles(address(gRouter), RECEIVE | FEED | SWAP | PAYEE);
        vm.warp(vm.getBlockTimestamp() + 3 days);
        gloak.applyRoles(address(GVAULT), RECEIVE | VAULT);
        gloak.applyRoles(address(gRouter), RECEIVE | FEED | SWAP | PAYEE);
        vm.stopPrank();

        // the stand-in: Gloam's real proof checkers say yes
        vm.mockCall(GVAULT.verifier(), abi.encodeWithSelector(IVerifierT.verify.selector), abi.encode(true));
        vm.mockCall(GVAULT.shieldVerifier(), abi.encodeWithSelector(IVerifierT.verify.selector), abi.encode(true));
    }

    /// Shielding into Gloam's vault is free and exact (its fee-on-transfer check passes), and withdrawing to a wallet
    /// pays 10% on top of Gloam's own cash-out fee.
    /// forge-config: default.isolate = true
    function test_shieldIntoGloamIsFreeAndWithdrawingPays10Percent() public {
        if (!forked) return;
        uint256 supply = gloak.totalSupply();
        uint256 inBefore = GVAULT.deposited(address(gloak));
        _shield(ada, 50_000e18);
        assertEq(GVAULT.deposited(address(gloak)) - inBefore, 50_000e18, "Gloam's vault holds the full 50,000: free and exact");
        assertEq(gloak.totalSupply(), supply, "nothing burned going in");
        (uint256 inVaults,,,,,) = gloak.meter();
        assertEq(inVaults, 50_000e18, "the meter counts Gloam's vault as private");

        uint256 fee = (10_000e18 * GVAULT.withdrawFeeBps()) / 10_000;
        GVAULT.unshield(hex"00", GVAULT.currentRoot(), _nullifier(), address(gloak), bob, 10_000e18);
        uint256 sent = 10_000e18 - fee;
        assertEq(gloak.balanceOf(bob), sent - sent / 10, "bob gets what Gloam pays out, less GLOAK's 10%");
        assertEq(gloak.heldForBurn(), sent / 10, "the 10% waits to burn");
        gloak.burnHeld();
        assertEq(gloak.totalSupply(), supply - sent / 10, "and burns: supply only falls");
        console.log("Withdrawal of 10,000 GLOAK from Gloam's vault: Gloam's fee", fee / 1e18, "| burned", sent / 10 / 1e18);
    }

    /// A private sell from Gloam's vault through Gloam's own router and escrow: GLOAK out of a note, HYPE into a new
    /// note, both in Gloam's vault. The escrow's 10% is held, then handed on to Gloam's router: nothing minted, the
    /// swap gets every token the vault paid out.
    function test_privateSellThroughGloamsOwnRouterIsFreeAndMintsNothing() public {
        if (!forked) return;
        _shield(ada, 50_000e18);
        uint256 supply = gloak.totalSupply();
        uint256 hypeIn = GVAULT.deposited(NATIVE);

        uint256 noteIn = 20_000e18;
        uint256 paidOut = noteIn - (noteIn * GVAULT.withdrawFeeBps()) / 10_000; // what the vault sends the escrow
        (uint256 rH, uint256 rT,) = market.reserves();
        uint256 hypeOut = (market.getAmountOut(paidOut, rT, rH) * 97) / 100; // a 3% buffer, as the app quotes

        V4Key memory v = hook.keyFor(address(gloak));
        PoolKey[] memory hops = new PoolKey[](1);
        hops[0] = _gk(v);
        bytes memory route = abi.encode(hops);
        GloamVaultSwap2.Spend memory s = GloamVaultSwap2.Spend(hex"00", GVAULT.currentRoot(), _nullifier(), address(gloak), noteIn);
        GloamVaultSwap2.Deposit memory d = GloamVaultSwap2.Deposit(hex"00", _commitment(), NATIVE, hypeOut);
        GloamVaultSwap2.Deposit memory r = GloamVaultSwap2.Deposit(hex"00", _commitment(), address(gloak), paidOut);

        vm.recordLogs();
        uint256 amountIn = gRouter.swap(s, d, r, route, makeAddr("exit key"), vm.getBlockTimestamp() + 600);
        Vm.Log[] memory logs = vm.getRecordedLogs();

        bytes32 transferSig = keccak256("Transfer(address,address,uint256)");
        bytes32 refundSig = keccak256("SurchargeRefunded(address,address,uint256)");
        bool handedOn;
        for (uint256 i; i < logs.length; ++i) {
            if (logs[i].emitter != address(gloak)) continue;
            if (logs[i].topics[0] == transferSig) assertTrue(logs[i].topics[1] != bytes32(0), "GLOAK was minted");
            if (logs[i].topics[0] == refundSig) {
                handedOn = true;
                assertEq(address(uint160(uint256(logs[i].topics[2]))), address(gRouter), "the held 10% went on to Gloam's router");
            }
        }
        assertTrue(handedOn, "the escrow's held surcharge was handed on (a transfer, not a mint)");
        assertEq(GVAULT.deposited(NATIVE) - hypeIn, hypeOut, "exactly the quoted HYPE lands as a new note in Gloam's vault");
        assertLe(amountIn, paidOut, "the swap spent at most what the vault paid out");
        assertEq(gloak.balanceOf(address(gloak)), 0, "nothing left held");
        assertEq(gloak.balanceOf(address(gRouter)), 0, "Gloam's router keeps nothing");
        // the swap's leftover (its price buffer) goes to Gloam's treasury, a public address: like any exit, it pays 10%
        uint256 leftover = paidOut - amountIn;
        assertEq(gloak.balanceOf(GTREASURY), leftover - leftover / 10, "the leftover reached Gloam's treasury, less 10%");
        assertEq(gloak.totalSupply(), supply - leftover / 10, "the only burn is the leftover's 10%: the sell itself was free");
        console.log("Private sell of 20,000 GLOAK via Gloam's router: HYPE out (milli)", hypeOut / 1e15, "| GLOAK into the pool", amountIn / 1e18);
    }

    // ───────────── helpers ─────────────

    function _shield(address from, uint256 amount) internal {
        vm.startPrank(from);
        gloak.approve(address(GVAULT), amount);
        GVAULT.shieldBound(address(gloak), amount, _commitment(), hex"00");
        vm.stopPrank();
    }

    function _commitment() internal returns (bytes32) {
        return bytes32(uint256(keccak256(abi.encode("gloak-on-gloam note", ++nonce))) >> 8); // inside the field
    }

    function _nullifier() internal returns (bytes32) {
        return keccak256(abi.encode("gloak-on-gloam spend", ++nonce));
    }

    function _gk(V4Key memory v) internal pure returns (PoolKey memory) {
        return PoolKey(Currency.unwrap(v.currency0), Currency.unwrap(v.currency1), v.fee, v.tickSpacing, address(v.hooks));
    }

    function _params() internal returns (CloakAuction.Params memory) {
        return CloakAuction.Params({
            creator: makeAddr("Cloak treasury"),
            saleSupply: 300_000e18,
            lpReserve: 200_000e18,
            minPrice: 1e13,
            tickSize: 1e12,
            numTicks: 50,
            commitEnd: uint64(block.timestamp + 1 hours),
            revealEnd: uint64(block.timestamp + 2 hours),
            lpBps: 5_000,
            noRevealPenaltyBps: 2_000,
            lpLockUntil: type(uint64).max,
            tlockRound: 0,
            minRaise: 0
        });
    }

    function _deployHook() internal returns (CloakV4Hook h) {
        bytes memory init = abi.encodePacked(type(CloakV4Hook).creationCode, abi.encode(address(PM), address(this), uint24(3_000), uint24(100_000), uint32(300)));
        bytes32 ih = keccak256(init);
        for (uint256 s; s < 500_000; ++s) {
            address a = vm.computeCreate2Address(bytes32(s), ih, address(this));
            if (uint160(a) & ((1 << 14) - 1) == FLAGS) return new CloakV4Hook{salt: bytes32(s)}(PM, address(this), 3_000, 100_000, 300);
        }
        revert("no salt");
    }

    receive() external payable {}
}
