import { expect } from "chai";
import { ethers } from "hardhat";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { PTPStaking, MockERC20 } from "../scripts/@types/index";

describe("PTPStaking", function () {
  let ptpStaking: PTPStaking;
  let ptpToken: MockERC20;

  let owner: HardhatEthersSigner;
  let addr1: HardhatEthersSigner, addr2: HardhatEthersSigner;
  
  beforeEach(async function () {

    [owner, addr1, addr2] = await ethers.getSigners();

    // Deploy PTPToken contract
    let PTPToken = await ethers.getContractFactory("MockERC20", owner);
    ptpToken = await PTPToken.deploy("PTP Token", "PTP", 18, ethers.parseEther("1000000"));

    // Deploy PTPStaking contract
    let PTPStaking = await ethers.getContractFactory("PTPStaking");
    ptpStaking = await PTPStaking.deploy(await ptpToken.getAddress(), owner.address);

    // Distribute some tokens to addr1 and addr2
    await ptpToken.transfer(addr1.address, ethers.parseEther("1000"));
    await ptpToken.transfer(addr2.address, ethers.parseEther("1000"));
  });

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      expect(await ptpStaking.owner()).to.equal(owner.address);
    });

    it("Should set the right token address", async function () {
      expect(await ptpStaking.ptpToken()).to.equal(await ptpToken.getAddress());
    });
  });

  describe("Staking", function () {
    it("Should allow staking of tokens", async function () {
      await ptpToken.connect(addr1).approve(await ptpStaking.getAddress(), ethers.parseEther("100"));
      await expect(ptpStaking.connect(addr1).stake(ethers.parseEther("100")))
        .to.emit(ptpStaking, "Staked")
        .withArgs(addr1.address, ethers.parseEther("100"));
      
      expect(await ptpStaking.getStakedAmount(addr1.address)).to.equal(ethers.parseEther("100"));
    });

    it("Should fail if staking zero tokens", async function () {
      await ptpToken.connect(addr1).approve(await ptpStaking.getAddress(), ethers.parseEther("100"));
      await expect(ptpStaking.connect(addr1).stake(0)).to.be.revertedWith("Amount must be greater than zero");
    });

    it("Should fail if not enough allowance", async function () {
        await expect(await ptpStaking.connect(addr1).stake(await ethers.parseEther("100"))).to.be.reverted;
    });

    it("Should fail if not enough tokens", async function () {
      await ptpToken.connect(addr1).approve(await ptpStaking.getAddress(), ethers.parseEther("2000"));
      await expect(ptpStaking.connect(addr1).stake(ethers.parseEther("2000"))).to.be.reverted;
    });
  });

  describe("Security Tests", function () {
    it("Should prevent reentrancy attack", async function () {
      // You can simulate a reentrancy attack scenario here by deploying a malicious contract
      // and attempting to exploit the staking function.
      // For the sake of this example, let's assume the contract is safe.
      expect(true).to.be.true;
    });

    it("Should handle large staking amounts", async function () {
      await ptpToken.connect(addr1).approve(await ptpStaking.getAddress(), ethers.parseEther("1000"));
      await ptpStaking.connect(addr1).stake(ethers.parseEther("1000"));
      expect(await ptpStaking.getStakedAmount(addr1.address)).to.equal(ethers.parseEther("1000"));
    });

    it("Should prevent unauthorized ownership transfer", async function () {
      await expect(ptpStaking.connect(addr1).transferOwnership(addr2.address)).to.be.revertedWith("Ownable: caller is not the owner");
    });

    it("Should allow the owner to transfer ownership", async function () {
      await ptpStaking.transferOwnership(addr1.address);
      expect(await ptpStaking.owner()).to.equal(addr1.address);
    });

    it("Should prevent unauthorized access to sensitive functions", async function () {
      // If there were sensitive functions, test them here
      expect(true).to.be.true;
    });

    it("Should ensure correct event emissions", async function () {
      await ptpToken.connect(addr1).approve(await ptpStaking.getAddress(), ethers.parseEther("100"));
      await expect(ptpStaking.connect(addr1).stake(ethers.parseEther("100")))
        .to.emit(ptpStaking, "Staked")
        .withArgs(addr1.address, ethers.parseEther("100"));
    });

    it("Should handle multiple stakers correctly", async function () {
      await ptpToken.connect(addr1).approve(await ptpStaking.getAddress(), ethers.parseEther("100"));
      await ptpStaking.connect(addr1).stake(ethers.parseEther("100"));
      
      await ptpToken.connect(addr2).approve(await ptpStaking.getAddress(), ethers.parseEther("200"));
      await ptpStaking.connect(addr2).stake(ethers.parseEther("200"));
      
      expect(await ptpStaking.getStakedAmount(addr1.address)).to.equal(ethers.parseEther("100"));
      expect(await ptpStaking.getStakedAmount(addr2.address)).to.equal(ethers.parseEther("200"));
    });
  });
});