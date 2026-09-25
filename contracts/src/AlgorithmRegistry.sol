// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {IFeedAlgorithm} from "./interfaces/IFeedAlgorithm.sol";

/// @notice Permissionless directory of feed algorithms, plus each user's choice.
/// @dev Trying an algorithm is free: clients eth_call any contract directly.
///      Writing a choice here costs one transaction and makes it follow the
///      user across clients.
///
///      Registered algorithms are arbitrary code, which is safe because rank()
///      is view-only and runs under the caller's own eth_call with a gas cap.
///      The worst a hostile entry can do is produce a bad ordering.
contract AlgorithmRegistry {
    error NoSuchAlgorithm();
    error NoSuchSlot();
    error NotAnAlgorithm();

    uint8 public constant SLOT_FEED = 0;
    uint8 public constant SLOT_EXPLORE = 1;

    address[] private _algorithms;

    /// @dev user => slot => algorithm. address(0) means "use the default".
    mapping(address => mapping(uint8 => address)) private _choice;

    address public immutable defaultFeed;
    address public immutable defaultExplore;

    event AlgorithmRegistered(
        uint256 indexed id, address indexed algorithm, string name, string description
    );
    event AlgorithmSelected(address indexed user, uint8 indexed slot, address algorithm);

    constructor(IFeedAlgorithm defaultFeed_, IFeedAlgorithm defaultExplore_) {
        defaultFeed = address(defaultFeed_);
        defaultExplore = address(defaultExplore_);
        _register(defaultFeed_); // id 0
        _register(defaultExplore_); // id 1
    }

    function algorithmCount() external view returns (uint256) {
        return _algorithms.length;
    }

    function algorithmAt(uint256 id) external view returns (address) {
        if (id >= _algorithms.length) revert NoSuchAlgorithm();
        return _algorithms[id];
    }

    function register(IFeedAlgorithm algo) external returns (uint256 id) {
        return _register(algo);
    }

    function _register(IFeedAlgorithm algo) private returns (uint256 id) {
        if (address(algo) == address(0)) revert NotAnAlgorithm();

        // Reject anything that cannot describe itself, so the UI never lists
        // an entry it has no label for.
        string memory n;
        string memory d;
        try algo.name() returns (string memory got) {
            n = got;
        } catch {
            revert NotAnAlgorithm();
        }
        try algo.description() returns (string memory got) {
            d = got;
        } catch {
            revert NotAnAlgorithm();
        }

        id = _algorithms.length;
        _algorithms.push(address(algo));

        emit AlgorithmRegistered(id, address(algo), n, d);
    }

    function setMyAlgorithm(uint8 slot, uint256 algorithmId) external {
        if (slot != SLOT_FEED && slot != SLOT_EXPLORE) revert NoSuchSlot();
        if (algorithmId >= _algorithms.length) revert NoSuchAlgorithm();

        address algo = _algorithms[algorithmId];
        _choice[msg.sender][slot] = algo;

        emit AlgorithmSelected(msg.sender, slot, algo);
    }

    function algorithmOf(address user, uint8 slot) external view returns (address) {
        address chosen = _choice[user][slot];
        if (chosen != address(0)) return chosen;
        if (slot == SLOT_EXPLORE) return defaultExplore;
        return defaultFeed;
    }
}
