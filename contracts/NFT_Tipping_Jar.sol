pragma solidity ^0.8.24;

import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract NFTTippingJarFHE is SepoliaConfig {
    using FHE for euint32;
    using FHE for ebool;

    address public owner;
    mapping(address => bool) public isProvider;
    bool public paused;
    uint256 public cooldownSeconds;
    mapping(address => uint256) public lastSubmissionTime;
    mapping(address => uint256) public lastDecryptionRequestTime;

    struct Tip {
        address tipper;
        euint32 encryptedAmount;
        euint32 encryptedMessagePart1;
        euint32 encryptedMessagePart2;
    }
    Tip[] public tips;

    struct Batch {
        uint256 id;
        bool isOpen;
        uint256 startTime;
        uint256 closeTime;
    }
    Batch[] public batches;
    mapping(uint256 => uint256) public batchTipCount; // batchId => count
    mapping(uint256 => uint256) public batchTotalEncryptedAmount; // batchId => euint32 (as uint256)

    struct DecryptionContext {
        uint256 batchId;
        bytes32 stateHash;
        bool processed;
    }
    mapping(uint256 => DecryptionContext) public decryptionContexts;

    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event ProviderAdded(address indexed provider);
    event ProviderRemoved(address indexed provider);
    event Paused(address account);
    event Unpaused(address account);
    event CooldownSecondsSet(uint256 oldCooldownSeconds, uint256 newCooldownSeconds);
    event BatchOpened(uint256 indexed batchId, uint256 startTime);
    event BatchClosed(uint256 indexed batchId, uint256 closeTime, uint256 tipCount);
    event TipSubmitted(address indexed tipper, uint256 indexed batchId, uint256 tipIndex);
    event DecryptionRequested(uint256 indexed requestId, uint256 indexed batchId, bytes32 stateHash);
    event DecryptionCompleted(uint256 indexed requestId, uint256 indexed batchId, uint256 totalAmount);

    error NotOwner();
    error NotProvider();
    error PausedState();
    error CooldownActive();
    error BatchNotOpen();
    error BatchOpen();
    error InvalidBatch();
    error ReplayAttempt();
    error StateMismatch();
    error InvalidProof();
    error NotInitialized();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyProvider() {
        if (!isProvider[msg.sender]) revert NotProvider();
        _;
    }

    modifier whenNotPaused() {
        if (paused) revert PausedState();
        _;
    }

    modifier checkSubmissionCooldown() {
        if (block.timestamp < lastSubmissionTime[msg.sender] + cooldownSeconds) {
            revert CooldownActive();
        }
        _;
    }

    modifier checkDecryptionCooldown() {
        if (block.timestamp < lastDecryptionRequestTime[msg.sender] + cooldownSeconds) {
            revert CooldownActive();
        }
        _;
    }

    constructor() {
        owner = msg.sender;
        isProvider[owner] = true;
        cooldownSeconds = 60; // Default 1 minute cooldown
        batches.push(Batch({ id: 0, isOpen: false, startTime: 0, closeTime: 0 })); // Dummy batch 0
    }

    function transferOwnership(address newOwner) external onlyOwner {
        address previousOwner = owner;
        owner = newOwner;
        emit OwnershipTransferred(previousOwner, newOwner);
    }

    function addProvider(address provider) external onlyOwner {
        if (!isProvider[provider]) {
            isProvider[provider] = true;
            emit ProviderAdded(provider);
        }
    }

    function removeProvider(address provider) external onlyOwner {
        if (isProvider[provider]) {
            isProvider[provider] = false;
            emit ProviderRemoved(provider);
        }
    }

    function pause() external onlyOwner whenNotPaused {
        paused = true;
        emit Paused(msg.sender);
    }

    function unpause() external onlyOwner {
        paused = false;
        emit Unpaused(msg.sender);
    }

    function setCooldownSeconds(uint256 newCooldownSeconds) external onlyOwner {
        uint256 oldCooldownSeconds = cooldownSeconds;
        cooldownSeconds = newCooldownSeconds;
        emit CooldownSecondsSet(oldCooldownSeconds, newCooldownSeconds);
    }

    function openBatch() external onlyProvider whenNotPaused {
        Batch storage currentBatch = batches[batches.length - 1];
        if (currentBatch.isOpen) revert BatchOpen();
        uint256 newBatchId = batches.length;
        batches.push(Batch({ id: newBatchId, isOpen: true, startTime: block.timestamp, closeTime: 0 }));
        emit BatchOpened(newBatchId, block.timestamp);
    }

    function closeBatch() external onlyProvider whenNotPaused {
        Batch storage currentBatch = batches[batches.length - 1];
        if (!currentBatch.isOpen) revert BatchNotOpen();
        currentBatch.isOpen = false;
        currentBatch.closeTime = block.timestamp;
        emit BatchClosed(currentBatch.id, currentBatch.closeTime, batchTipCount[currentBatch.id]);
    }

    function submitTip(
        euint32 encryptedAmount,
        euint32 encryptedMessagePart1,
        euint32 encryptedMessagePart2
    ) external whenNotPaused checkSubmissionCooldown {
        Batch storage currentBatch = batches[batches.length - 1];
        if (!currentBatch.isOpen) revert BatchNotOpen();

        _initIfNeeded(encryptedAmount);
        _initIfNeeded(encryptedMessagePart1);
        _initIfNeeded(encryptedMessagePart2);

        tips.push(Tip({
            tipper: msg.sender,
            encryptedAmount: encryptedAmount,
            encryptedMessagePart1: encryptedMessagePart1,
            encryptedMessagePart2: encryptedMessagePart2
        }));
        uint256 tipIndex = tips.length - 1;

        batchTipCount[currentBatch.id] += 1;
        if (batchTotalEncryptedAmount[currentBatch.id] == 0) {
            batchTotalEncryptedAmount[currentBatch.id] = encryptedAmount.toUint256();
        } else {
            euint32 currentTotal = euint32.wrap(batchTotalEncryptedAmount[currentBatch.id]);
            euint32 newTotal = currentTotal.add(encryptedAmount);
            batchTotalEncryptedAmount[currentBatch.id] = newTotal.toUint256();
        }

        lastSubmissionTime[msg.sender] = block.timestamp;
        emit TipSubmitted(msg.sender, currentBatch.id, tipIndex);
    }

    function requestBatchTotalDecryption(uint256 batchId) external onlyProvider whenNotPaused checkDecryptionCooldown {
        if (batchId >= batches.length || batchId == 0) revert InvalidBatch();
        if (batches[batchId].isOpen) revert BatchOpen();

        euint32 totalEncryptedAmount = euint32.wrap(batchTotalEncryptedAmount[batchId]);
        _initIfNeeded(totalEncryptedAmount);

        bytes32[] memory cts = new bytes32[](1);
        cts[0] = totalEncryptedAmount.toBytes32();

        bytes32 stateHash = _hashCiphertexts(cts);
        uint256 requestId = FHE.requestDecryption(cts, this.myCallback.selector);

        decryptionContexts[requestId] = DecryptionContext({
            batchId: batchId,
            stateHash: stateHash,
            processed: false
        });

        lastDecryptionRequestTime[msg.sender] = block.timestamp;
        emit DecryptionRequested(requestId, batchId, stateHash);
    }

    function myCallback(uint256 requestId, bytes memory cleartexts, bytes memory proof) public {
        if (decryptionContexts[requestId].processed) revert ReplayAttempt();
        // Security: Replay protection ensures a decryption request is processed only once.

        DecryptionContext memory ctx = decryptionContexts[requestId];
        Batch storage batch = batches[ctx.batchId];

        // Security: Rebuild ciphertexts from current contract state in the exact same order
        // as during the request. This ensures that the state of the contract hasn't changed
        // in a way that would affect the decryption result.
        euint32 currentTotalEncryptedAmount = euint32.wrap(batchTotalEncryptedAmount[ctx.batchId]);
        _initIfNeeded(currentTotalEncryptedAmount); // Ensure it's initialized for .toBytes32()
        bytes32[] memory currentCts = new bytes32[](1);
        currentCts[0] = currentTotalEncryptedAmount.toBytes32();

        bytes32 currentStateHash = _hashCiphertexts(currentCts);
        if (currentStateHash != ctx.stateHash) revert StateMismatch();

        if (!FHE.checkSignatures(requestId, cleartexts, proof)) revert InvalidProof();

        (uint32 totalAmount) = abi.decode(cleartexts, (uint32));

        decryptionContexts[requestId].processed = true;
        emit DecryptionCompleted(requestId, ctx.batchId, totalAmount);
    }

    function _hashCiphertexts(bytes32[] memory cts) internal pure returns (bytes32) {
        return keccak256(abi.encode(cts, address(this)));
    }

    function _initIfNeeded(euint32 val) internal {
        if (!val.isInitialized()) revert NotInitialized();
    }

    function _initIfNeeded(ebool val) internal {
        if (!val.isInitialized()) revert NotInitialized();
    }
}