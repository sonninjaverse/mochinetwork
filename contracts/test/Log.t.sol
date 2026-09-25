// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Test} from "forge-std/Test.sol";
import {Log} from "../src/lib/Log.sol";

contract LogTest is Test {
    /// Within 0.1% of the true value is far tighter than a ranking needs, and
    /// tight enough that this never disagrees with Reddit's float version.
    function assertClose(uint256 got, uint256 want, string memory what) internal pure {
        uint256 diff = got > want ? got - want : want - got;
        assertLt(diff, want / 1000 + 1e12, what);
    }

    function test_Log10OfPowersOfTen() public pure {
        assertClose(Log.log10Int(10), 1e18, "log10(10)");
        assertClose(Log.log10Int(100), 2e18, "log10(100)");
        assertClose(Log.log10Int(1000), 3e18, "log10(1000)");
        assertClose(Log.log10Int(1_000_000), 6e18, "log10(1e6)");
    }

    function test_Log10OfKnownValues() public pure {
        assertClose(Log.log10Int(2), 301029995663981195, "log10(2)");
        assertClose(Log.log10Int(50), 1698970004336018800, "log10(50)");
        assertClose(Log.log10Int(99), 1995635194598489500, "log10(99)");
    }

    /// The clamp Reddit applies: max(abs(s), 1), so zero and one both score 0.
    function test_SmallInputsAreZero() public pure {
        assertEq(Log.log10Int(0), 0);
        assertEq(Log.log10Int(1), 0);
    }

    /// @dev The property a ranking actually depends on.
    function testFuzz_Log10IsMonotonic(uint32 a, uint32 b) public pure {
        vm.assume(a > 1 && b > a);
        assertLe(Log.log10Int(a), Log.log10Int(b));
    }

    function testFuzz_NeverReverts(uint256 n) public pure {
        Log.log10Int(n % 1e30);
    }
}
