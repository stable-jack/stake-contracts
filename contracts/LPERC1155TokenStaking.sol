// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { IERC1155 } from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import { OwnableUpgradeable } from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import { Initializable } from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

contract ERC1155Staking is Initializable, ReentrancyGuardUpgradeable, OwnableUpgradeable {
    struct UserSnapshot {
        uint256 initialAmountStaked;
        uint256 tokenId;
    }

    struct UserUnlock {
        uint256 amount;
        uint256 tokenId;
        uint256 unlockAt;
    }

    address public hexagate;

    mapping(uint256 => bool) public supportedTokens;
    uint256[] public supportedTokensArray; // Array to keep track of supported token IDs
    mapping(address => mapping(uint256 => uint256)) private userBalances;
    mapping(address => mapping(uint256 => UserUnlock)) public userUnlocks;
    mapping(address => mapping(uint256 => UserSnapshot)) private userSnapshots;

    uint256 public unlockDuration = 1 weeks;
    bool public paused = false;

    event Staked(address indexed user, uint256 amount, uint256 indexed tokenId);
    event UnlockStarted(address indexed user, uint256 amount, uint256 indexed tokenId, uint256 unlockAt);
    event Unstaked(address indexed user, uint256 amount, uint256 indexed tokenId);
    event TokenSupportAdded(uint256 indexed tokenId);
    event TokenSupportRemoved(uint256 indexed tokenId);
    event Paused();
    event Unpaused();

    modifier onlyHexagate() {
        require(msg.sender == hexagate, "Not Hexagate");
        _;
    }

    modifier whenNotPaused() {
        require(!paused, "Contract is paused");
        _;
    }

    // Initializer function to replace the constructor
    function initialize(address _hexagate) external initializer {
        __ReentrancyGuard_init();
        __Ownable_init();

        hexagate = _hexagate;
    }

    function pause() external onlyHexagate {
        paused = true;
        emit Paused();
    }

    function unpause() external onlyHexagate {
        paused = false;
        emit Unpaused();
    }

    function stake(uint256 amount, uint256 tokenId) external whenNotPaused nonReentrant {
        require(supportedTokens[tokenId], "Token not supported");
        require(amount > 0, "Amount must be greater than zero");

        IERC1155(hexagate).safeTransferFrom(msg.sender, address(this), tokenId, amount, "");

        userBalances[msg.sender][tokenId] += amount;
        if (userSnapshots[msg.sender][tokenId].initialAmountStaked == 0) {
            userSnapshots[msg.sender][tokenId] = UserSnapshot({
                initialAmountStaked: amount,
                tokenId: tokenId
            });
        } else {
            userSnapshots[msg.sender][tokenId].initialAmountStaked += amount;
        }

        emit Staked(msg.sender, amount, tokenId);
    }

    function unlock(uint256 amount, uint256 tokenId) external whenNotPaused nonReentrant {
        require(supportedTokens[tokenId], "Token not supported");
        require(amount > 0, "Amount must be greater than zero");
        require(userBalances[msg.sender][tokenId] >= amount, "Insufficient balance");

        userUnlocks[msg.sender][tokenId] = UserUnlock({
            amount: amount,
            tokenId: tokenId,
            unlockAt: block.timestamp + unlockDuration
        });

        emit UnlockStarted(msg.sender, amount, tokenId, block.timestamp + unlockDuration);
    }

    function unstake(uint256 amount, uint256 tokenId) external whenNotPaused nonReentrant {
        require(supportedTokens[tokenId], "Token not supported");
        require(amount > 0, "Amount must be greater than zero");

        UserUnlock memory unlockInfo = userUnlocks[msg.sender][tokenId];
        require(unlockInfo.amount >= amount, "Insufficient unlocked amount");
        require(block.timestamp >= unlockInfo.unlockAt, "Unlock period not completed");

        userBalances[msg.sender][tokenId] -= amount;
        userUnlocks[msg.sender][tokenId].amount -= amount;

        IERC1155(hexagate).safeTransferFrom(address(this), msg.sender, tokenId, amount, "");

        emit Unstaked(msg.sender, amount, tokenId);
    }

    function balanceOf(uint256 tokenId, address userAddress) external view returns (uint256) {
        return userBalances[userAddress][tokenId];
    }

    function balanceOfAllTokens(address userAddress) external view returns (uint256[] memory, uint256[] memory) {
        uint256[] memory balances = new uint256[](supportedTokensArray.length);

        for (uint256 i = 0; i < supportedTokensArray.length; i++) {
            balances[i] = userBalances[userAddress][supportedTokensArray[i]];
        }

        return (balances, supportedTokensArray);
    }

    function addTokenSupport(uint256 tokenId) external onlyOwner {
        require(!supportedTokens[tokenId], "Token already supported");
        supportedTokens[tokenId] = true;
        supportedTokensArray.push(tokenId);
        emit TokenSupportAdded(tokenId);
    }

    function removeTokenSupport(uint256 tokenId) external onlyOwner {
        require(supportedTokens[tokenId], "Token not supported");

        for (uint256 i = 0; i < supportedTokensArray.length; i++) {
            if (userBalances[supportedTokensArray[i]][tokenId] > 0) {
                revert("Users have staked tokens");
            }
        }

        supportedTokens[tokenId] = false;

        // Remove token from the supportedTokensArray
        for (uint256 i = 0; i < supportedTokensArray.length; i++) {
            if (supportedTokensArray[i] == tokenId) {
                supportedTokensArray[i] = supportedTokensArray[supportedTokensArray.length - 1];
                supportedTokensArray.pop();
                break;
            }
        }

        emit TokenSupportRemoved(tokenId);
    }

    function getAllSupportedTokens() public view returns (uint256[] memory) {
        return supportedTokensArray;
    }
}
