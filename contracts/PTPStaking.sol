// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract PTPStaking is Ownable {
    IERC20 public ptpToken;
    
    struct Stake {
        uint256 amount;
        uint256 timestamp;
    }
    
    mapping(address => Stake) private stakes;

    event Staked(address indexed user, uint256 amount);

    constructor(address _ptpToken, address initialOwner) Ownable(initialOwner) {
        ptpToken = IERC20(_ptpToken);
    }

    function stake(uint256 _amount) external {
        require(_amount > 0, "Amount must be greater than zero");
        require(ptpToken.transferFrom(msg.sender, address(this), _amount), "Token transfer failed");

        stakes[msg.sender].amount += _amount;
        stakes[msg.sender].timestamp = block.timestamp;

        emit Staked(msg.sender, _amount);
    }

    function getStakedAmount(address _staker) external view returns (uint256) {
        return stakes[_staker].amount;
    }
}

