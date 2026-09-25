// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice Communities for Mochi Network.
/// @dev Holds the two things that need a single source of truth: who holds a
///      name, and who has joined it. A post's community is a `bytes32` field on
///      `PostRegistry`; this registry is what answers whether that name exists
///      and whether a post's author is a member of it.
contract CommunityRegistry {
    error NameTaken();
    error BadName();
    error NoSuchCommunity();
    error NotCreator();
    error MetadataTooLong();

    /// @dev Metadata rides in the event. 8 KB fits an inline data URI with an
    ///      icon and stops one that would make the log unreadable.
    uint256 private constant MAX_METADATA_BYTES = 8 * 1024;

    /// @notice Nonzero means the community exists, and the value is its creator.
    mapping(bytes32 => address) public creatorOf;

    /// @notice Nonzero means "joined", and the value is when it started.
    /// @dev A uint64 timestamp costs the same slot as a bool but carries more.
    mapping(bytes32 => mapping(address => uint64)) public joinedAt;

    event Created(bytes32 indexed name, address indexed creator, uint64 at, string metadataURI);
    event MetadataUpdated(bytes32 indexed name, string metadataURI);
    event Joined(bytes32 indexed name, address indexed account, uint64 at);
    event Left(bytes32 indexed name, address indexed account);

    /// @param name Lower-case ASCII, zero-padded on the right.
    function create(bytes32 name, string calldata metadataURI) external {
        if (!isValidName(name)) revert BadName();
        if (creatorOf[name] != address(0)) revert NameTaken();
        if (bytes(metadataURI).length > MAX_METADATA_BYTES) revert MetadataTooLong();

        creatorOf[name] = msg.sender;
        emit Created(name, msg.sender, uint64(block.timestamp), metadataURI);
    }

    function join(bytes32 name) external {
        if (creatorOf[name] == address(0)) revert NoSuchCommunity();
        if (joinedAt[name][msg.sender] != 0) return;

        joinedAt[name][msg.sender] = uint64(block.timestamp);
        emit Joined(name, msg.sender, uint64(block.timestamp));
    }

    function leave(bytes32 name) external {
        if (joinedAt[name][msg.sender] == 0) return;

        joinedAt[name][msg.sender] = 0;
        emit Left(name, msg.sender);
    }

    /// @notice Describes a name its creator already holds.
    /// @dev The only caller-restricted function in this repository, and the
    ///      same shape as IdentityRegistry.setMetadata: you may describe what
    ///      you registered. It confers nothing over anyone's posts — there is
    ///      no remove, no ban, and no transfer, here or anywhere else.
    function setMetadata(bytes32 name, string calldata metadataURI) external {
        address creator = creatorOf[name];
        if (creator == address(0)) revert NoSuchCommunity();
        if (creator != msg.sender) revert NotCreator();
        if (bytes(metadataURI).length > MAX_METADATA_BYTES) revert MetadataTooLong();

        emit MetadataUpdated(name, metadataURI);
    }

    /// @notice Whether `name` is a well-formed community name.
    /// @dev Validated on chain, unlike a handle, because a community name is a
    ///      stored `bytes32` that clients match by string equality. Exactly one
    ///      spelling may exist, or `m/VietNam` and `m/vietnam` become two
    ///      communities that look like one.
    function isValidName(bytes32 name) public pure returns (bool) {
        uint256 len;
        for (uint256 i; i < 32; ++i) {
            uint8 c = uint8(name[i]);
            if (c == 0) {
                // Everything past the first zero must also be zero. A name with
                // an interior gap decodes differently in different clients.
                for (uint256 j = i + 1; j < 32; ++j) {
                    if (uint8(name[j]) != 0) return false;
                }
                break;
            }
            bool ok = (c >= 0x61 && c <= 0x7A) // a-z
                || (c >= 0x30 && c <= 0x39) // 0-9
                || c == 0x5F; // _
            if (!ok) return false;
            len = i + 1;
        }
        return len >= 3 && len <= 21;
    }
}
