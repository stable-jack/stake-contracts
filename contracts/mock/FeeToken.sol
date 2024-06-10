// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract FeeToken is ERC20 {
    address public feeCollector;

    constructor(string memory name, string memory symbol, uint256 initialSupply) ERC20(name, symbol) {
        _mint(msg.sender, initialSupply);
        feeCollector = msg.sender; // Initialize the fee collector to the deployer
    }

    function setFeeCollector(address _feeCollector) external {
        require(msg.sender == feeCollector, "Only the current fee collector can set a new fee collector");
        feeCollector = _feeCollector;
    }

    function transfer(address recipient, uint256 amount) public override returns (bool) {
        uint256 fee = amount / 100; // 1% fee
        uint256 amountAfterFee = amount - fee;
        super.transfer(feeCollector, fee); // Send the fee to the fee collector
        return super.transfer(recipient, amountAfterFee);
    }

    function transferFrom(address sender, address recipient, uint256 amount) public override returns (bool) {
        uint256 fee = amount / 100; // 1% fee
        uint256 amountAfterFee = amount - fee;
        super.transferFrom(sender, feeCollector, fee); // Send the fee to the fee collector
        return super.transferFrom(sender, recipient, amountAfterFee);
    }
}
