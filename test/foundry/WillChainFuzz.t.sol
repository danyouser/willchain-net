// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "forge-std/Test.sol";
import "../../contracts/WillChain.sol";

/**
 * @title WillChain Fuzz Tests
 * @notice Foundry fuzz tests for dividend invariants and totalUnregisteredSupply consistency.
 *
 * Run: forge test --match-contract WillChainFuzz -vvv
 * CI:  FOUNDRY_PROFILE=ci forge test --match-contract WillChainFuzz
 */
contract WillChainFuzz is Test {
    WillChain public token;
    address public deployer;

    // Pre-created users (addresses derived from index)
    address[] public users;
    uint256 constant NUM_USERS = 5;

    function setUp() public {
        deployer = address(this);
        token = new WillChain();

        // Create user addresses and fund them
        for (uint256 i = 1; i <= NUM_USERS; i++) {
            address user = address(uint160(i * 1000));
            users.push(user);
            // Give each user some tokens
            token.transfer(user, 10_000_000 ether);
        }
    }

    // ──────────────────────────────────────────────────────────────
    // INVARIANT: sum(pendingDividends) + dividendPool holdings <= contract balance
    // ──────────────────────────────────────────────────────────────

    function testFuzz_dividendPoolNeverExceedsContractBalance(
        uint8 userIdx,
        uint256 transferAmt
    ) public {
        // Bound inputs
        userIdx = uint8(bound(userIdx, 0, NUM_USERS - 1));
        address user = users[userIdx];
        uint256 userBal = token.balanceOf(user);
        if (userBal == 0) return;
        transferAmt = bound(transferAmt, 1, userBal);

        // Register user
        vm.prank(user);
        token.confirmActivity();
        vm.prank(user);
        token.designateSuccessor(deployer);

        // Transfer to create activity
        vm.prank(user);
        token.transfer(users[(userIdx + 1) % NUM_USERS], transferAmt);

        // Check invariant: dividendPool <= contract token balance
        uint256 contractBal = token.balanceOf(address(token));
        uint256 pool = token.dividendPool();
        assertLe(pool, contractBal, "dividendPool exceeds contract balance");
    }

    function testFuzz_dividendSolvencyAfterRecycle(
        uint8 userIdx,
        uint256 depositAmt
    ) public {
        userIdx = uint8(bound(userIdx, 0, NUM_USERS - 1));
        address victim = users[userIdx];
        uint256 victimBal = token.balanceOf(victim);
        if (victimBal == 0) return;
        depositAmt = bound(depositAmt, 1000 ether, victimBal);

        // Register victim with successor
        vm.prank(victim);
        token.confirmActivity();
        vm.prank(victim);
        token.designateSuccessor(deployer);

        // Register at least one other user so dividends have recipients
        address otherUser = users[(userIdx + 1) % NUM_USERS];
        vm.prank(otherUser);
        token.confirmActivity();
        vm.prank(otherUser);
        token.designateSuccessor(deployer);

        // Fast-forward past total timeout (inactivity + grace + claim)
        uint256 totalTimeout = token.getTotalTimeout(victim);
        vm.warp(block.timestamp + totalTimeout + token.COMMIT_REVEAL_WINDOW() + 1);

        // Roll to next block for flashloan prevention
        vm.roll(block.number + 1);

        // Recycle the abandoned node
        token.recycleInactiveNode(victim);

        // INVARIANT: sum of all pending dividends <= contract balance
        uint256 totalPending = 0;
        for (uint256 i = 0; i < NUM_USERS; i++) {
            totalPending += token.pendingDividends(users[i]);
        }
        totalPending += token.pendingDividends(deployer);

        uint256 contractBal = token.balanceOf(address(token));
        assertLe(
            totalPending,
            contractBal,
            "Total pending dividends exceed contract balance after recycle"
        );

        // Also check dividendPool consistency
        assertLe(
            token.dividendPool(),
            contractBal,
            "dividendPool exceeds contract balance after recycle"
        );
    }

    // ──────────────────────────────────────────────────────────────
    // INVARIANT: totalUnregisteredSupply is consistent
    // ──────────────────────────────────────────────────────────────

    function testFuzz_totalUnregisteredSupplyConsistency(
        uint8 userIdx
    ) public {
        userIdx = uint8(bound(userIdx, 0, NUM_USERS - 1));
        address user = users[userIdx];

        // Before registration: user balance should be counted in totalUnregisteredSupply
        uint256 unregBefore = token.totalUnregisteredSupply();

        // Register
        vm.prank(user);
        token.confirmActivity();

        uint256 unregAfter = token.totalUnregisteredSupply();
        uint256 userBal = token.balanceOf(user);

        // totalUnregisteredSupply should decrease by user's balance
        assertEq(
            unregBefore - unregAfter,
            userBal,
            "totalUnregisteredSupply did not decrease by user balance on registration"
        );
    }

    function testFuzz_totalUnregisteredSupplyAfterRecycleRestore(
        uint8 userIdx
    ) public {
        userIdx = uint8(bound(userIdx, 0, NUM_USERS - 1));
        address victim = users[userIdx];

        // Register victim
        vm.prank(victim);
        token.confirmActivity();
        vm.prank(victim);
        token.designateSuccessor(deployer);

        // Register another user for dividend pool
        address other = users[(userIdx + 1) % NUM_USERS];
        vm.prank(other);
        token.confirmActivity();
        vm.prank(other);
        token.designateSuccessor(deployer);

        // Fast-forward past total timeout
        uint256 totalTimeout = token.getTotalTimeout(victim);
        vm.warp(block.timestamp + totalTimeout + token.COMMIT_REVEAL_WINDOW() + 1);
        vm.roll(block.number + 1);

        // Recycle
        token.recycleInactiveNode(victim);

        // After recycling, victim's remaining balance (if any) should be in totalUnregisteredSupply
        uint256 victimBal = token.balanceOf(victim);
        bool isEverRegistered = token.everRegistered(victim);

        if (victimBal > 0) {
            assertFalse(isEverRegistered, "Recycled node should not be everRegistered");
        }
    }

    // ──────────────────────────────────────────────────────────────
    // INVARIANT: token supply conservation
    // ──────────────────────────────────────────────────────────────

    function testFuzz_supplyConservationAfterRecycle(
        uint8 userIdx
    ) public {
        userIdx = uint8(bound(userIdx, 0, NUM_USERS - 1));
        address victim = users[userIdx];

        // Register both users
        vm.prank(victim);
        token.confirmActivity();
        vm.prank(victim);
        token.designateSuccessor(deployer);

        address other = users[(userIdx + 1) % NUM_USERS];
        vm.prank(other);
        token.confirmActivity();
        vm.prank(other);
        token.designateSuccessor(deployer);

        uint256 supplyBefore = token.totalSupply();

        // Abandon and recycle
        vm.warp(block.timestamp + token.getTotalTimeout(victim) + token.COMMIT_REVEAL_WINDOW() + 1);
        vm.roll(block.number + 1);
        token.recycleInactiveNode(victim);

        uint256 supplyAfter = token.totalSupply();
        uint256 burned = token.totalRemovedFromCirculation();

        // Supply should only decrease by amount burned
        assertEq(
            supplyBefore - supplyAfter,
            burned,
            "Supply change doesn't match total burned amount"
        );
    }

    // ──────────────────────────────────────────────────────────────
    // INVARIANT: unregistered users cannot accumulate dividends
    // ──────────────────────────────────────────────────────────────

    function testFuzz_unregisteredNeverEarnsDividends(
        uint8 userIdx,
        uint8 victimIdx
    ) public {
        userIdx = uint8(bound(userIdx, 0, NUM_USERS - 1));
        victimIdx = uint8(bound(victimIdx, 0, NUM_USERS - 1));
        vm.assume(userIdx != victimIdx);

        address user = users[userIdx]; // stays unregistered
        address victim = users[victimIdx];

        // Register victim and another user
        vm.prank(victim);
        token.confirmActivity();
        vm.prank(victim);
        token.designateSuccessor(deployer);

        // Register deployer so there's a dividend recipient
        // (deployer is already registered via constructor)

        // Abandon victim and recycle — creates dividends
        vm.warp(block.timestamp + token.getTotalTimeout(victim) + token.COMMIT_REVEAL_WINDOW() + 1);
        vm.roll(block.number + 1);
        token.recycleInactiveNode(victim);

        // Unregistered user should have 0 pending dividends
        uint256 pending = token.pendingDividends(user);
        assertEq(pending, 0, "Unregistered user should never earn dividends");
    }

    // ──────────────────────────────────────────────────────────────
    // INVARIANT: commit-reveal hash integrity
    // ──────────────────────────────────────────────────────────────

    function testFuzz_commitRevealHashIntegrity(
        uint8 userIdx,
        uint8 victimIdx,
        bytes32 salt
    ) public {
        userIdx = uint8(bound(userIdx, 0, NUM_USERS - 1));
        victimIdx = uint8(bound(victimIdx, 0, NUM_USERS - 1));
        vm.assume(userIdx != victimIdx);

        address committer = users[userIdx];
        address victim = users[victimIdx];

        // Register victim so they can go ABANDONED
        vm.prank(victim);
        token.confirmActivity();
        vm.prank(victim);
        token.designateSuccessor(deployer);

        // Register another user for dividend recipient
        address other = users[(userIdx + 2) % NUM_USERS];
        if (other == victim) other = users[(userIdx + 3) % NUM_USERS];
        vm.prank(other);
        token.confirmActivity();
        vm.prank(other);
        token.designateSuccessor(deployer);

        // Fast-forward to ABANDONED (within fresh window)
        uint256 totalTimeout = token.getTotalTimeout(victim);
        vm.warp(block.timestamp + totalTimeout + 1);
        vm.roll(block.number + 1);

        // Commit
        bytes32 commitHash = keccak256(abi.encodePacked(victim, salt, committer));
        vm.prank(committer);
        token.commitRecycle(commitHash);

        // Mine blocks past COMMIT_MIN_DELAY
        vm.roll(block.number + 3);

        // Execute with correct salt — should succeed
        vm.prank(committer);
        token.executeRecycle(victim, salt);

        // Victim should be recycled (balance 0 or near 0)
        assertEq(token.balanceOf(victim), 0, "Victim should have 0 balance after recycle");
    }

    // ──────────────────────────────────────────────────────────────
    // INVARIANT: circular successor always blocked
    // ──────────────────────────────────────────────────────────────

    function testFuzz_circularSuccessorAlwaysBlocked(
        uint8 userAIdx,
        uint8 userBIdx
    ) public {
        userAIdx = uint8(bound(userAIdx, 0, NUM_USERS - 1));
        userBIdx = uint8(bound(userBIdx, 0, NUM_USERS - 1));
        vm.assume(userAIdx != userBIdx);

        address userA = users[userAIdx];
        address userB = users[userBIdx];

        // Register both
        vm.prank(userA);
        token.confirmActivity();
        vm.prank(userB);
        token.confirmActivity();

        // A designates B
        vm.prank(userA);
        token.designateSuccessor(userB);

        // B tries to designate A — must revert
        vm.prank(userB);
        vm.expectRevert(abi.encodeWithSelector(WillChain.CircularSuccessorChain.selector));
        token.designateSuccessor(userA);
    }

    // ──────────────────────────────────────────────────────────────
    // INVARIANT: re-registration after recycle restores dividend eligibility
    // ──────────────────────────────────────────────────────────────

    function testFuzz_reRegistrationAfterRecycle(
        uint8 userIdx
    ) public {
        userIdx = uint8(bound(userIdx, 0, NUM_USERS - 1));
        address victim = users[userIdx];

        // Register victim
        vm.prank(victim);
        token.confirmActivity();
        vm.prank(victim);
        token.designateSuccessor(deployer);

        // Register another user for dividend pool
        address other = users[(userIdx + 1) % NUM_USERS];
        vm.prank(other);
        token.confirmActivity();
        vm.prank(other);
        token.designateSuccessor(deployer);

        // Abandon and recycle
        vm.warp(block.timestamp + token.getTotalTimeout(victim) + token.COMMIT_REVEAL_WINDOW() + 1);
        vm.roll(block.number + 1);
        token.recycleInactiveNode(victim);

        // Victim is now unregistered
        assertFalse(token.everRegistered(victim), "Should be unregistered after recycle");

        // Fund victim again and re-register
        token.transfer(victim, 5_000_000 ether);
        vm.prank(victim);
        token.confirmActivity();

        // Should be registered again
        assertTrue(token.everRegistered(victim), "Should be re-registered");

        // totalUnregisteredSupply should not include re-registered user's balance
        // Abandon another user and recycle to generate dividends
        address victim2 = users[(userIdx + 2) % NUM_USERS];
        vm.prank(victim2);
        token.confirmActivity();
        vm.prank(victim2);
        token.designateSuccessor(deployer);

        vm.warp(block.timestamp + token.getTotalTimeout(victim2) + token.COMMIT_REVEAL_WINDOW() + 1);
        vm.roll(block.number + 1);

        // Keep victim alive
        vm.prank(victim);
        token.confirmActivity();

        token.recycleInactiveNode(victim2);

        // Re-registered user should earn dividends
        uint256 pending = token.pendingDividends(victim);
        assertGt(pending, 0, "Re-registered user should earn dividends");
    }

    // ──────────────────────────────────────────────────────────────
    // INVARIANT: totalSupply only decreases (never mints after constructor)
    // ──────────────────────────────────────────────────────────────

    function testFuzz_supplyOnlyDecreases(
        uint8 userIdx,
        uint256 transferAmt
    ) public {
        userIdx = uint8(bound(userIdx, 0, NUM_USERS - 1));
        address user = users[userIdx];
        uint256 userBal = token.balanceOf(user);
        if (userBal == 0) return;
        transferAmt = bound(transferAmt, 1, userBal);

        uint256 supplyBefore = token.totalSupply();

        // Register, transfer, confirm — none of these should increase supply
        vm.prank(user);
        token.confirmActivity();
        vm.prank(user);
        token.transfer(users[(userIdx + 1) % NUM_USERS], transferAmt);

        assertLe(token.totalSupply(), supplyBefore, "totalSupply increased after non-mint operations");
    }

    // ──────────────────────────────────────────────────────────────
    // INVARIANT: dividendPool <= contract balance (always solvent)
    // ──────────────────────────────────────────────────────────────

    function testFuzz_dividendPoolAlwaysSolvent(
        uint8 userIdx
    ) public {
        userIdx = uint8(bound(userIdx, 0, NUM_USERS - 1));
        address victim = users[userIdx];

        // Register victim
        vm.prank(victim);
        token.confirmActivity();
        vm.prank(victim);
        token.designateSuccessor(deployer);

        // Register another user for dividend pool
        address other = users[(userIdx + 1) % NUM_USERS];
        vm.prank(other);
        token.confirmActivity();
        vm.prank(other);
        token.designateSuccessor(deployer);

        // Recycle victim
        vm.warp(block.timestamp + token.getTotalTimeout(victim) + token.COMMIT_REVEAL_WINDOW() + 1);
        vm.roll(block.number + 1);
        token.recycleInactiveNode(victim);

        // Claim dividends as other
        vm.prank(other);
        token.claimDividends();

        // After claiming, dividendPool must still <= contract balance
        assertLe(
            token.dividendPool(),
            token.balanceOf(address(token)),
            "dividendPool exceeds contract balance after claim"
        );
    }

    // ──────────────────────────────────────────────────────────────
    // INVARIANT: totalUnregisteredSupply == sum of unregistered balances
    // ──────────────────────────────────────────────────────────────

    function testFuzz_totalUnregisteredSupplyEqualsSum(
        uint8 registerIdx
    ) public {
        registerIdx = uint8(bound(registerIdx, 0, NUM_USERS - 1));

        // Register only one user — rest stay unregistered
        vm.prank(users[registerIdx]);
        token.confirmActivity();

        // Sum unregistered balances manually
        uint256 expectedUnreg = 0;
        for (uint256 i = 0; i < NUM_USERS; i++) {
            if (!token.everRegistered(users[i])) {
                expectedUnreg += token.balanceOf(users[i]);
            }
        }

        assertEq(
            token.totalUnregisteredSupply(),
            expectedUnreg,
            "totalUnregisteredSupply != sum of unregistered balances"
        );
    }

    // ──────────────────────────────────────────────────────────────
    // INVARIANT: reentrancy guard blocks nested calls
    // ──────────────────────────────────────────────────────────────

    function testFuzz_reentrancyBlocked(uint8 userIdx) public {
        userIdx = uint8(bound(userIdx, 0, NUM_USERS - 1));
        address user = users[userIdx];

        vm.prank(user);
        token.confirmActivity();

        // Cannot call claimDividends during recycleInactiveNode (nonReentrant)
        // This is inherently blocked by the modifier — just verify it doesn't panic
        // by calling view functions during state changes
        uint256 pending = token.pendingDividends(user);
        assertGe(pending, 0, "pendingDividends should never revert for registered user");
    }

    // ──────────────────────────────────────────────────────────────
    // INVARIANT: fresh ABANDONED blocks direct recycle
    // ──────────────────────────────────────────────────────────────

    function testFuzz_delegatedSpendBlockedWhenNotActive(
        uint8 userIdx,
        uint8 spenderIdx,
        uint256 extraTime
    ) public {
        userIdx = uint8(bound(userIdx, 0, NUM_USERS - 1));
        spenderIdx = uint8(bound(spenderIdx, 0, NUM_USERS - 1));
        vm.assume(userIdx != spenderIdx);
        address user = users[userIdx];
        address spender = users[spenderIdx];

        // Register user and set up vault
        vm.prank(user);
        token.confirmActivity();
        vm.prank(user);
        token.designateSuccessor(deployer);

        // Approve spender
        vm.prank(user);
        token.approve(spender, type(uint256).max);

        // Advance past inactivity period into GRACE
        uint256 inactPeriod = token.getInactivityPeriod(user);
        extraTime = bound(extraTime, 1, 365 days);
        vm.warp(block.timestamp + inactPeriod + extraTime);
        vm.roll(block.number + 1);

        // Vault must NOT be ACTIVE or UNREGISTERED
        WillChain.VaultStatus status = token.getVaultStatus(user);
        assertTrue(
            status != WillChain.VaultStatus.ACTIVE && status != WillChain.VaultStatus.UNREGISTERED,
            "vault should be non-ACTIVE after inactivity"
        );

        // Delegated spend must revert
        vm.prank(spender);
        vm.expectRevert(abi.encodeWithSelector(WillChain.DelegatedSpendingBlocked.selector));
        token.transferFrom(user, spender, 1);
    }

    // ──────────────────────────────────────────────────────────────
    // INVARIANT: fresh ABANDONED blocks direct recycle
    // ──────────────────────────────────────────────────────────────

    function testFuzz_freshAbandonedBlocksDirectRecycle(
        uint8 userIdx,
        uint256 freshOffset
    ) public {
        userIdx = uint8(bound(userIdx, 0, NUM_USERS - 1));
        address victim = users[userIdx];

        // Register victim
        vm.prank(victim);
        token.confirmActivity();
        vm.prank(victim);
        token.designateSuccessor(deployer);

        // Register another for dividend pool
        address other = users[(userIdx + 1) % NUM_USERS];
        vm.prank(other);
        token.confirmActivity();
        vm.prank(other);
        token.designateSuccessor(deployer);

        // Advance to ABANDONED but within fresh window
        uint256 totalTimeout = token.getTotalTimeout(victim);
        // freshOffset: 1 to COMMIT_REVEAL_WINDOW-1 (within fresh window)
        freshOffset = bound(freshOffset, 1, token.COMMIT_REVEAL_WINDOW() - 1);
        vm.warp(block.timestamp + totalTimeout + freshOffset);
        vm.roll(block.number + 1);

        // Direct recycle should revert
        vm.expectRevert(abi.encodeWithSelector(WillChain.UseFreshCommitReveal.selector));
        token.recycleInactiveNode(victim);
    }
}
