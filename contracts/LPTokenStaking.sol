// SPDX-License-Identifier: MIT
pragma solidity 0.8.20;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { IERC1155 } from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import { ERC165 } from "@openzeppelin/contracts/utils/introspection/ERC165.sol";
import { IERC165 } from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import { Ownable2StepUpgradeable } from "@openzeppelin/contracts-upgradeable/access/Ownable2StepUpgradeable.sol";
import { Initializable } from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import { IERC1155Receiver } from "@openzeppelin/contracts/token/ERC1155/IERC1155Receiver.sol";

contract LPStaking is Initializable, ReentrancyGuardUpgradeable, Ownable2StepUpgradeable, ERC165, IERC1155Receiver {
    using SafeERC20 for IERC20;

    /***********
    * Structs *
    ***********/
    struct UserSnapshot {
        uint256 initialAmountStaked;
        address token;
    }

    struct UserUnlock {
        uint256 amount;
        address token;
        uint256 unlockAt;
        bool initialized;
    }

    /*************
     * Variables *
     *************/

    address public hexagate;
    uint256 public unlockDuration = 1 weeks;
    bool public paused = false;

    mapping(address => bool) public supportedLPTokens;
    mapping(address => bool) public supportedERC1155Tokens;
    address[] public supportedTokensArray; // Array to keep track of supported tokens
    
    mapping(address => mapping(address => uint256)) private userBalances;
    mapping(address => mapping(address => mapping(uint256 => uint256))) private userBalances1155;

    mapping(address => mapping(address => UserUnlock)) public userUnlocks;
    mapping(address => mapping(address => UserSnapshot)) private userSnapshots;
    mapping(address => uint256) private tokenUserCount; // Mapping to keep track of user count for each token

    /************
     * Events *
     ************/
    event Staked(address indexed user, uint256 amount, address indexed token);
    event UnlockStarted(address indexed user, uint256 amount, address indexed token, uint256 unlockAt);
    event Unstaked(address indexed user, uint256 amount, address indexed token);
    event LPTokenSupportAdded(address indexed token);
    event LPTokenSupportRemoved(address indexed token);

    event Staked1155(address indexed user, uint256 id, uint256 amount, address indexed token);
    event UnlockStarted1155(address indexed user, uint256 id, uint256 amount, address indexed token, uint256 unlockAt);
    event Unstaked1155(address indexed user, uint256 id, uint256 amount, address indexed token);
    event ERC1155TokenSupportAdded(address indexed token);
    event ERC1155TokenSupportRemoved(address indexed token);

    event Paused();
    event Unpaused();

    /*************
     * Modifiers *
     *************/

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
        require(_hexagate != address(0), "New hexagate address cannot be the zero address");
        __ReentrancyGuard_init();
        __Ownable2Step_init();

        hexagate = _hexagate;
        _transferOwnership(msg.sender); // Set the initial owner
    }

    function pause() external onlyHexagate {
        paused = true;
        emit Paused();
    }

    function unpause() external onlyHexagate {
        paused = false;
        emit Unpaused();
    }

    function stake(uint256 amount, address token) external whenNotPaused nonReentrant {
        require(supportedLPTokens[token], "Token not supported");
        require(amount != 0, "Amount must be greater than zero");

        uint256 balanceBefore = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount); // Use safeTransferFrom

        uint256 balanceAfter = IERC20(token).balanceOf(address(this));
        uint256 actualReceived = balanceAfter - balanceBefore;
        require(actualReceived != 0, "Token transfer failed");

        if (userBalances[msg.sender][token] == 0) {
            tokenUserCount[token]++;
        }

        userBalances[msg.sender][token] += actualReceived;
        if (userSnapshots[msg.sender][token].initialAmountStaked == 0) {
            userSnapshots[msg.sender][token] = UserSnapshot({
                initialAmountStaked: actualReceived,
                token: token
            });
        } else {
            userSnapshots[msg.sender][token].initialAmountStaked += actualReceived;
        }

        emit Staked(msg.sender, actualReceived, token);
    }

    function stake1155(address token, uint256 id, uint256 amount) external whenNotPaused nonReentrant {
        require(supportedERC1155Tokens[token], "Token not supported");
        require(amount != 0, "Amount must be greater than zero");

        uint256 balanceBefore = IERC1155(token).balanceOf(address(this), id);
        IERC1155(token).safeTransferFrom(msg.sender, address(this), id, amount, "");

        uint256 balanceAfter = IERC1155(token).balanceOf(address(this), id);
        uint256 actualReceived = balanceAfter - balanceBefore;
        require(actualReceived != 0, "Token transfer failed");

        if(userBalances1155[msg.sender][token][id] == 0){
            tokenUserCount[token]++;
        }

        userBalances1155[msg.sender][token][id] += amount;

        if(userSnapshots[msg.sender][token].initialAmountStaked == 0) {
            userSnapshots[msg.sender][token] = UserSnapshot({
                initialAmountStaked: amount,
                token: token
            });
        } else {
            userSnapshots[msg.sender][token].initialAmountStaked += amount;
        }

        emit Staked1155(msg.sender, id, amount, token);
    }

    function unlock(address token) external whenNotPaused nonReentrant {
        require(supportedLPTokens[token], "Token not supported");
        uint256 userBalance = userBalances[msg.sender][token];
        require(userBalance != 0, "Insufficient balance");

        UserUnlock storage unlockInfo = userUnlocks[msg.sender][token];
        require(!unlockInfo.initialized, "Unlock already initialized");

        userUnlocks[msg.sender][token] = UserUnlock({
            amount: userBalance,
            token: token,
            unlockAt: block.timestamp + unlockDuration,
            initialized: true
        });

        emit UnlockStarted(msg.sender, userBalance, token, block.timestamp + unlockDuration);
    }

    function unlock1155(address token, uint256 id) external whenNotPaused nonReentrant {
        require(supportedERC1155Tokens[token], "Token not supported");
        uint256 userBalance = userBalances1155[msg.sender][token][id];
        require(userBalance != 0, "Insufficient balance");

        UserUnlock storage unlockInfo = userUnlocks[msg.sender][token];
        require(!unlockInfo.initialized, "Unlock already initialized");

        userUnlocks[msg.sender][token] = UserUnlock({
            amount: userBalance,
            token: token,
            unlockAt: block.timestamp + unlockDuration,
            initialized: true
        });

        emit UnlockStarted1155(msg.sender, id, userBalance, token, block.timestamp + unlockDuration);
    }

    function unstake(address token) external whenNotPaused nonReentrant {
        require(supportedLPTokens[token], "Token not supported");

        UserUnlock memory unlockInfo = userUnlocks[msg.sender][token];
        require(block.timestamp >= unlockInfo.unlockAt, "Unlock period not completed");
        require(unlockInfo.amount != 0, "No unlocked amount available");

        uint256 amountToUnstake = unlockInfo.amount;

        uint256 balanceBefore = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransfer(msg.sender, amountToUnstake); // Use safeTransfer

        uint256 balanceAfter = IERC20(token).balanceOf(address(this));
        uint256 actualTransferred = balanceBefore - balanceAfter;
        require(actualTransferred != 0, "Token transfer failed");

        userBalances[msg.sender][token] -= actualTransferred;
        delete userUnlocks[msg.sender][token]; // Clear the unlock info after unstaking

        if (userBalances[msg.sender][token] == 0) {
            tokenUserCount[token]--;
        }

        emit Unstaked(msg.sender, actualTransferred, token);
    }


    function unstake1155(address token, uint256 id) external whenNotPaused nonReentrant {
        require(supportedERC1155Tokens[token], "Token not supported");

        UserUnlock memory unlockInfo = userUnlocks[msg.sender][token];
        require(block.timestamp >= unlockInfo.unlockAt, "Unlock period not completed");
        require(unlockInfo.amount != 0, "No unlocked amount available");

        uint256 amountToUnstake = unlockInfo.amount;

        uint256 balanceBefore = IERC1155(token).balanceOf(address(this), id);
        IERC1155(token).safeTransferFrom(address(this), msg.sender, id, amountToUnstake, "");

        uint256 balanceAfter = IERC1155(token).balanceOf(address(this), id);
        uint256 actualTransferred = balanceBefore - balanceAfter;
        require(actualTransferred != 0, "Token transfer failed");

        userBalances1155[msg.sender][token][id] -= actualTransferred;
        delete userUnlocks[msg.sender][token];

        if(userBalances[msg.sender][token] == 0) {
            tokenUserCount[token]--;
        }

        emit Unstaked1155(msg.sender, id, actualTransferred, token);
    }

    function balanceOf(address token, address userAddress) external view returns (uint256) {
        uint256 balance = userBalances[userAddress][token];
        UserUnlock memory unlockInfo = userUnlocks[userAddress][token];

        if (unlockInfo.initialized && block.timestamp >= unlockInfo.unlockAt) {
            return 0; // If tokens are unlocked, return 0 as they are ready to be unstaked
        }

        return balance;
    }

    function balanceOf1155(address token, uint256 id, address userAddress) external view returns (uint256) {
        uint256 balance = userBalances1155[userAddress][token][id];
        UserUnlock memory unlockInfo = userUnlocks[userAddress][token];

        if (unlockInfo.initialized && block.timestamp >= unlockInfo.unlockAt) {
            return 0;
        }

        return balance;
    }

    function addLPTokenSupport(address token) external onlyOwner {
        require(!supportedLPTokens[token], "Token already supported");
        require(token != address(0), "New token address cannot be the zero address");
        supportedLPTokens[token] = true;
        supportedTokensArray.push(token);
        emit LPTokenSupportAdded(token);
    }

    function addERC1155TokenSupport(address token) external onlyOwner {
        require(!supportedERC1155Tokens[token], "Token already supported");
        require(token != address(0), "New token address cannot be the zero address");
        supportedERC1155Tokens[token] = true;
        supportedTokensArray.push(token);
        emit ERC1155TokenSupportAdded(token);
    }

    function removeLPTokenSupport(address token) external onlyOwner {
        require(supportedLPTokens[token], "Token not supported");
        require(tokenUserCount[token] == 0, "Users have staked tokens");

        supportedLPTokens[token] = false;

        // Remove token from the supportedTokensArray
        for (uint256 i = 0; i < supportedTokensArray.length; ++i) {
            if (supportedTokensArray[i] == token) {
                supportedTokensArray[i] = supportedTokensArray[supportedTokensArray.length - 1];
                supportedTokensArray.pop();
                break;
            }
        }

        emit LPTokenSupportRemoved(token);
    }

    function removeERC1155TokenSupport(address token) external onlyOwner {
        require(supportedERC1155Tokens[token], "Token not supported");
        require(tokenUserCount[token] == 0, "Users have staked tokens");
        supportedERC1155Tokens[token] = false;

        for (uint256 i = 0; i < supportedTokensArray.length; ++i) {
            if (supportedTokensArray[i] == token) {
                supportedTokensArray[i] = supportedTokensArray[supportedTokensArray.length - 1];
                supportedTokensArray.pop();
                break;
            }
        }

        emit ERC1155TokenSupportRemoved(token);
    }

    function getAllSupportedTokens() public view returns (address[] memory) {
        return supportedTokensArray;
    }

    // Add the updateHexagateAddress function
    function updateHexagateAddress(address newHexagate) external onlyOwner {
        require(newHexagate != address(0), "New hexagate address cannot be the zero address");
        hexagate = newHexagate;
    }
    
    function updateUnlockDuration(uint256 newDuration) external onlyOwner {
        require(newDuration > 0, "Unlock duration must be greater than zero");
        unlockDuration = newDuration;
    }

    function onERC1155Received(
        address /* operator */,
        address /* from */,
        uint256 /* id */,
        uint256 /* value */,
        bytes calldata /* data */
    ) external pure override returns (bytes4) {
        return this.onERC1155Received.selector;
    }

    function onERC1155BatchReceived(
        address /* operator */,
        address /* from */,
        uint256[] calldata /* ids */,
        uint256[] calldata /* values */,
        bytes calldata /* data */
    ) external pure override returns (bytes4) {
        return this.onERC1155BatchReceived.selector;
    }

    function supportsInterface(bytes4 interfaceId) public view virtual override(ERC165, IERC165) returns (bool) {
        return
            interfaceId == type(IERC1155Receiver).interfaceId ||
            super.supportsInterface(interfaceId);
    }
}