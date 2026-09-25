// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice Handle ownership for Mochi Network.
/// @dev Only the handle mapping is stored, because that is the only part a
///      ranking contract could ever need. Display name, avatar and bio live in
///      event data and are reconstructed by the indexer.
contract IdentityRegistry {
    error HandleTaken();
    error AlreadyRegistered();
    error EmptyHandle();
    error BadHandle();
    error MetadataTooLong();
    error NotRegistered();

    /// @dev A handle is a human identifier and the client only knows how to
    ///      render this alphabet, so a malformed one is refused here rather
    ///      than left for every client to disagree about.
    uint256 private constant MAX_HANDLE_LENGTH = 15;
    uint256 private constant MIN_HANDLE_LENGTH = 3;

    /// @dev Metadata rides in the event, so the only guard needed is against a
    ///      payload that makes the log unreadable. 8 KB fits an inline data
    ///      URI with room to spare and stops a megabyte one.
    uint256 private constant MAX_METADATA_BYTES = 8 * 1024;

    mapping(bytes32 => address) public handleOwner;
    mapping(address => bytes32) public handleOf;

    event Registered(address indexed account, bytes32 indexed handle, string metadataURI);
    event HandleChanged(address indexed account, bytes32 indexed from, bytes32 indexed to);
    event MetadataUpdated(address indexed account, string metadataURI);

    /// @notice Whether `handle` is a well-formed name.
    /// @dev The same alphabet the client enforces, checked on chain because
    ///      uniqueness without a canonical spelling is not uniqueness at all:
    ///      `Alice` and `alice` would be two owners of one name.
    function isValidHandle(bytes32 handle) public pure returns (bool) {
        uint256 len;
        for (uint256 i; i < 32; ++i) {
            uint8 c = uint8(handle[i]);
            if (c == 0) {
                // Everything past the first zero must also be zero, or the
                // name decodes differently in different clients.
                for (uint256 j = i + 1; j < 32; ++j) {
                    if (uint8(handle[j]) != 0) return false;
                }
                break;
            }
            bool ok = (c >= 0x61 && c <= 0x7A) // a-z
                || (c >= 0x30 && c <= 0x39) // 0-9
                || c == 0x5F; // _
            if (!ok) return false;
            len = i + 1;
        }
        return len >= MIN_HANDLE_LENGTH && len <= MAX_HANDLE_LENGTH;
    }

    function register(bytes32 handle, string calldata metadataURI) external {
        if (handle == bytes32(0)) revert EmptyHandle();
        if (!isValidHandle(handle)) revert BadHandle();
        if (handleOwner[handle] != address(0)) revert HandleTaken();
        if (handleOf[msg.sender] != bytes32(0)) revert AlreadyRegistered();
        if (bytes(metadataURI).length > MAX_METADATA_BYTES) revert MetadataTooLong();

        handleOwner[handle] = msg.sender;
        handleOf[msg.sender] = handle;

        emit Registered(msg.sender, handle, metadataURI);
    }

    /// @notice Trades the caller's handle for a different one.
    /// @dev The old name is released in the same call that takes the new one.
    ///      Doing it in either order alone would leave a name stranded or an
    ///      account holding two, and uniqueness is the only thing this
    ///      contract exists to guarantee.
    function changeHandle(bytes32 newHandle) external {
        if (newHandle == bytes32(0)) revert EmptyHandle();
        if (!isValidHandle(newHandle)) revert BadHandle();

        bytes32 current = handleOf[msg.sender];
        if (current == bytes32(0)) revert NotRegistered();
        // Covers renaming to your own name, which would otherwise free and
        // retake it — a no-op with a gap in the middle.
        if (handleOwner[newHandle] != address(0)) revert HandleTaken();

        delete handleOwner[current];
        handleOwner[newHandle] = msg.sender;
        handleOf[msg.sender] = newHandle;

        emit HandleChanged(msg.sender, current, newHandle);
    }

    function setMetadata(string calldata metadataURI) external {
        if (handleOf[msg.sender] == bytes32(0)) revert NotRegistered();
        if (bytes(metadataURI).length > MAX_METADATA_BYTES) revert MetadataTooLong();
        emit MetadataUpdated(msg.sender, metadataURI);
    }
}
