// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract FakeERC20 is ERC20 {
    uint8 private _decimals;

    constructor(string memory name, string memory symbol, uint8 decimalss, uint256 initialSupply) ERC20(name, symbol) {
        _decimals = decimalss;
        _mint(msg.sender, initialSupply);
    }

    function transfer(address /*recipient*/, uint256 /*amount*/) public pure override returns (bool) {
        return false;
    }

    function transferFrom(address /*sender*/, address /*recipient*/, uint256 /*amount*/) public pure override returns (bool) {
        return false;
    }
    
    function decimals() public view virtual override returns (uint8) {
        return _decimals;
    }
}
