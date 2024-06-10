// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { ReentrancyGuardUpgradeable } from "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import { OwnableUpgradeable } from "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import { Initializable } from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

contract LPStaking is Initializable, ReentrancyGuardUpgradeable, OwnableUpgradeable {
    struct UserSnapshot {
        uint256 initialAmountStaked;
        address token;
    }

    struct UserUnlock {
        uint256 amount;
        address token;
        uint256 unlockAt;
    }

    address public hexagate;

    mapping(address => bool) public supportedLPTokens;
    address[] public supportedTokensArray; // Array to keep track of supported tokens
    mapping(address => mapping(address => uint256)) private userBalances;
    mapping(address => mapping(address => UserUnlock)) public userUnlocks;
    mapping(address => mapping(address => UserSnapshot)) private userSnapshots;
    mapping(address => uint256) private tokenUserCount; // Mapping to keep track of user count for each token

    uint256 public unlockDuration = 1 weeks;
    bool public paused = false;

    event Staked(address indexed user, uint256 amount, address indexed token);
    event UnlockStarted(address indexed user, uint256 amount, address indexed token, uint256 unlockAt);
    event Unstaked(address indexed user, uint256 amount, address indexed token);
    event LPTokenSupportAdded(address indexed token);
    event LPTokenSupportRemoved(address indexed token);
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
        __Ownable_init(msg.sender);

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

    function stake(uint256 amount, address token) external whenNotPaused nonReentrant {
        require(supportedLPTokens[token], "Token not supported");
        require(amount > 0, "Amount must be greater than zero");

        uint256 balanceBefore = IERC20(token).balanceOf(address(this));
        bool success = IERC20(token).transferFrom(msg.sender, address(this), amount);
        require(success, "Token transfer failed");

        uint256 balanceAfter = IERC20(token).balanceOf(address(this));
        uint256 actualReceived = balanceAfter - balanceBefore;
        require(actualReceived > 0, "Token transfer failed");

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

    function unlock(uint256 amount, address token) external whenNotPaused nonReentrant {
        require(supportedLPTokens[token], "Token not supported");
        require(amount > 0, "Amount must be greater than zero");
        require(userBalances[msg.sender][token] >= amount, "Insufficient balance");

        userUnlocks[msg.sender][token] = UserUnlock({
            amount: amount,
            token: token,
            unlockAt: block.timestamp + unlockDuration
        });

        emit UnlockStarted(msg.sender, amount, token, block.timestamp + unlockDuration);
    }

    function unstake(uint256 amount, address token) external whenNotPaused nonReentrant {
        require(supportedLPTokens[token], "Token not supported");
        require(amount > 0, "Amount must be greater than zero");

        UserUnlock memory unlockInfo = userUnlocks[msg.sender][token];
        require(unlockInfo.amount >= amount, "Insufficient unlocked amount");
        require(block.timestamp >= unlockInfo.unlockAt, "Unlock period not completed");

        uint256 balanceBefore = IERC20(token).balanceOf(address(this));
        bool success = IERC20(token).transfer(msg.sender, amount);
        require(success, "Token transfer failed");

        uint256 balanceAfter = IERC20(token).balanceOf(address(this));
        uint256 actualTransferred = balanceBefore - balanceAfter;
        require(actualTransferred > 0, "Token transfer failed");

        userBalances[msg.sender][token] -= actualTransferred;
        userUnlocks[msg.sender][token].amount -= actualTransferred;

        if (userBalances[msg.sender][token] == 0) {
            tokenUserCount[token]--;
        }

        emit Unstaked(msg.sender, actualTransferred, token);
    }

    function balanceOf(address token, address userAddress) external view returns (uint256) {
        return userBalances[userAddress][token];
    }

    function balanceOfAllTokens(address userAddress) external view returns (uint256[] memory, address[] memory) {
        uint256[] memory balances = new uint256[](supportedTokensArray.length);

        for (uint256 i = 0; i < supportedTokensArray.length; i++) {
            balances[i] = userBalances[userAddress][supportedTokensArray[i]];
        }

        return (balances, supportedTokensArray);
    }

    function addLPTokenSupport(address token) external onlyOwner {
        require(!supportedLPTokens[token], "Token already supported");
        supportedLPTokens[token] = true;
        supportedTokensArray.push(token);
        emit LPTokenSupportAdded(token);
    }

    function removeLPTokenSupport(address token) external onlyOwner {
        require(supportedLPTokens[token], "Token not supported");
        require(tokenUserCount[token] == 0, "Users have staked tokens");

        supportedLPTokens[token] = false;

        // Remove token from the supportedTokensArray
        for (uint256 i = 0; i < supportedTokensArray.length; i++) {
            if (supportedTokensArray[i] == token) {
                supportedTokensArray[i] = supportedTokensArray[supportedTokensArray.length - 1];
                supportedTokensArray.pop();
                break;
            }
        }

        emit LPTokenSupportRemoved(token);
    }

    function getAllSupportedTokens() public view returns (address[] memory) {
        return supportedTokensArray;
    }
}