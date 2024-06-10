import { expect } from "chai";
import { ethers } from "hardhat";
import { MockERC20, LPStaking } from "../scripts/@types/index";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { string } from "hardhat/internal/core/params/argumentTypes";

describe("LPStaking", function () {
    
    let lpStaking: LPStaking;
    let owner: HardhatEthersSigner;
    let hexagate: HardhatEthersSigner;
    let user1: HardhatEthersSigner;
    let user2: HardhatEthersSigner;
    let token: MockERC20;

    beforeEach(async function () {
        [owner, hexagate, user1, user2] = await ethers.getSigners();

        const ERC20Mock = await ethers.getContractFactory("MockERC20", owner);
        token = await ERC20Mock.deploy("Mock Token", "MCK", 18, ethers.parseEther("1000"));

        const LPStaking = await ethers.getContractFactory("LPStaking", owner);
        lpStaking = await LPStaking.deploy();

        await lpStaking.initialize(hexagate.address);
    });

    describe("Initialization", function () {
        it("Should set the correct hexagate address", async function () {
            expect(await lpStaking.hexagate()).to.equal(hexagate.address);
        });

        it("Should not be paused initially", async function () {
            expect(await lpStaking.paused()).to.be.false;
        });
    });

    describe("Token Support", function () {
        it("Should add LP token support", async function () {
            await lpStaking.addLPTokenSupport(await token.getAddress());
            expect(await lpStaking.supportedLPTokens(await token.getAddress())).to.be.true;
        });

        it("Should remove LP token support", async function () {
            await lpStaking.addLPTokenSupport(await token.getAddress());
            await lpStaking.removeLPTokenSupport(await token.getAddress());
            expect(await lpStaking.supportedLPTokens(await token.getAddress())).to.be.false;
        });

        it("Should revert if token is already supported", async function () {
            await lpStaking.addLPTokenSupport(await token.getAddress());
            await expect(lpStaking.addLPTokenSupport(await token.getAddress())).to.be.revertedWith("Token already supported");
        });

        it("Should revert if token is not supported", async function () {
            await expect(lpStaking.removeLPTokenSupport(await token.getAddress())).to.be.revertedWith("Token not supported");
        });

        it("Should not remove LP token support if there are staked tokens", async function () {
            await lpStaking.addLPTokenSupport(await token.getAddress());
            await token.transfer(user1.address, ethers.parseEther("100"));
            await token.connect(user1).approve(lpStaking.getAddress(), ethers.parseEther("50"));
            await lpStaking.connect(user1).stake(ethers.parseEther("50"), await token.getAddress());
    
            await expect(lpStaking.removeLPTokenSupport(await token.getAddress())).to.be.revertedWith("Users have staked tokens");
        });
    
        it("Should remove LP token support if there are no staked tokens", async function () {
            await lpStaking.addLPTokenSupport(await token.getAddress());
            await lpStaking.removeLPTokenSupport(await token.getAddress());
    
            expect(await lpStaking.supportedLPTokens(await token.getAddress())).to.be.false;
        });    
    });

    describe("Staking", function () {
        beforeEach(async function () {
            await lpStaking.addLPTokenSupport(await token.getAddress());
            await token.transfer(user1.address, ethers.parseEther("100"));
        });

        it("Should stake tokens correctly", async function () {
            await token.connect(user1).approve(lpStaking.getAddress(), ethers.parseEther("50"));
            await lpStaking.connect(user1).stake(ethers.parseEther("50"), await token.getAddress());

            expect(await lpStaking.balanceOf(await token.getAddress(), user1.address)).to.equal(ethers.parseEther("50"));
        });

        it("Should emit Staked event", async function () {
            await token.connect(user1).approve(lpStaking.getAddress(), ethers.parseEther("50"));
            await expect(lpStaking.connect(user1).stake(ethers.parseEther("50"), await token.getAddress()))
                .to.emit(lpStaking, "Staked")
                .withArgs(user1.address, ethers.parseEther("50"), await token.getAddress());
        });

        it("Should revert if token is not supported", async function () {
            await expect(lpStaking.connect(user1).stake(ethers.parseEther("50"), user2.address))
                .to.be.revertedWith("Token not supported");
        });

        it("Should revert if amount is zero", async function () {
            await expect(lpStaking.connect(user1).stake(0, await token.getAddress())).to.be.revertedWith("Amount must be greater than zero");
        });

        it("Should revert if ERC20 transferFrom returns false", async function () {
            const FakeERC20 = await ethers.getContractFactory("FakeERC20", owner);
            const fakeToken = await FakeERC20.deploy("Fake Token", "FAKE", 18, ethers.parseEther("1000"));
    
            await lpStaking.addLPTokenSupport(await fakeToken.getAddress());
            await fakeToken.transfer(user1.address, ethers.parseEther("100"));
            await fakeToken.connect(user1).approve(lpStaking.getAddress(), ethers.parseEther("50"));
    
            await expect(lpStaking.connect(user1).stake(ethers.parseEther("50"), await fakeToken.getAddress()))
                .to.be.revertedWith("Token transfer failed");
        });

        it("Should handle ERC20 tokens with transfer fees correctly", async function () {
            const FeeToken = await ethers.getContractFactory("FeeToken", owner);
            const feeToken = await FeeToken.deploy("Fee Token", "FEE", ethers.parseEther("1000").toString());
    
            await lpStaking.addLPTokenSupport(await feeToken.getAddress());
            await feeToken.transfer(user1.address, ethers.parseEther("100"));
            await feeToken.connect(user1).approve(lpStaking.getAddress(), ethers.parseEther("50"));
    
            await lpStaking.connect(user1).stake(ethers.parseEther("50"), await feeToken.getAddress());
    
            const contractBalance = await feeToken.balanceOf(await lpStaking.getAddress());
            const userBalance = await lpStaking.balanceOf(await feeToken.getAddress(), user1.address);
            
            // Check that the actual received amount is less due to the transfer fee
            expect(contractBalance).to.be.lessThan(ethers.parseEther("50"));
            expect(userBalance).to.be.equal(contractBalance);
        });
    
    });

    describe("Unlocking", function () {
        beforeEach(async function () {
            await lpStaking.addLPTokenSupport(await token.getAddress());
            await token.transfer(user1.address, ethers.parseEther("100"));
            await token.connect(user1).approve(lpStaking.getAddress(), ethers.parseEther("50"));
            await lpStaking.connect(user1).stake(ethers.parseEther("50"), await token.getAddress());
        });

        it("Should unlock the entire staked amount", async function () {
            await lpStaking.connect(user1).unlock(await token.getAddress());
    
            const unlockInfo = await lpStaking.userUnlocks(user1.address, await token.getAddress());
            expect(unlockInfo.amount).to.equal(ethers.parseEther("50"));
        });
    
        it("Should update unlock time correctly", async function () {
            await lpStaking.connect(user1).unlock(await token.getAddress());
            
            const block = await ethers.provider.getBlock('latest');
            if (!block) {
                throw new Error("Failed to fetch the latest block.");
            }
            const unlockTime = block.timestamp+ 604800;
    
            const unlockInfo = await lpStaking.userUnlocks(user1.address, await token.getAddress());
            expect(unlockInfo.unlockAt).to.be.closeTo(unlockTime, 10);
        });

        it("Should revert if unlock is called again before unstaking", async function () {
            await lpStaking.connect(user1).unlock(await token.getAddress());
    
            await expect(lpStaking.connect(user1).unlock(await token.getAddress()))
                .to.be.revertedWith("Unlock already initialized");
        });

        it("Should revert if token is not supported", async function () {
            await expect(lpStaking.connect(user1).unlock(user2.address))
                .to.be.revertedWith("Token not supported");
        });

    });

    describe("Unstaking", function () {
        beforeEach(async function () {
            await lpStaking.addLPTokenSupport(await token.getAddress());
            await token.transfer(user1.address, ethers.parseEther("100"));
            await token.connect(user1).approve(lpStaking.getAddress(), ethers.parseEther("50"));
            await lpStaking.connect(user1).stake(ethers.parseEther("50"), await token.getAddress());
            await lpStaking.connect(user1).unlock(await token.getAddress());

            // Fast forward time by 1 week
            await ethers.provider.send("evm_increaseTime", [604800]);
            await ethers.provider.send("evm_mine");

            const FakeERC20 = await ethers.getContractFactory("FakeERC20", owner);
            this.fakeToken = await FakeERC20.deploy("Fake Token", "FAKE", 18, ethers.parseEther("1000").toString());
    
            await lpStaking.addLPTokenSupport(await this.fakeToken.getAddress());
            await this.fakeToken.transfer(user1.address, ethers.parseEther("100"));
            await this.fakeToken.connect(user1).approve(lpStaking.getAddress(), ethers.parseEther("50"));
        });

        it("Should unstake tokens correctly", async function () {
            await lpStaking.connect(user1).unstake(await token.getAddress());

            expect(await token.balanceOf(user1.address)).to.equal(ethers.parseEther("100"));
            expect(await lpStaking.balanceOf(await token.getAddress(), user1.address)).to.equal(ethers.parseEther("0"));
        });

        it("Should unstake the entire unlocked amount", async function () {
            await lpStaking.connect(user1).unstake(await token.getAddress());
    
            const userBalance = await token.balanceOf(user1.address);
            const contractBalance = await token.balanceOf(lpStaking.getAddress());
            const stakedBalance = await lpStaking.balanceOf(await token.getAddress(), user1.address);
    
            // Check that the entire unlocked amount is unstaked
            expect(userBalance).to.equal(ethers.parseEther("100"));
            expect(contractBalance).to.equal(ethers.parseEther("0"));
            expect(stakedBalance).to.equal(ethers.parseEther("0"));
        });
    
        it("Should update unlock time correctly", async function () {
            const block = await ethers.provider.getBlock('latest');
            if (!block) {
                throw new Error("Failed to fetch the latest block.");
            }
            const unlockTime = block.timestamp + 604800;
    
            const unlockInfo = await lpStaking.userUnlocks(user1.address, await token.getAddress());
            expect(unlockInfo.unlockAt).to.be.closeTo(unlockTime, 1000000);
        });

        it("Should emit Unstaked event", async function () {
            await expect(lpStaking.connect(user1).unstake(await token.getAddress()))
                .to.emit(lpStaking, "Unstaked")
                .withArgs(user1.address, ethers.parseEther("50"), await token.getAddress());
        });

        it("Should revert if token is not supported", async function () {
            await expect(lpStaking.connect(user1).unstake( user2.address))
                .to.be.revertedWith("Token not supported");
        });

        it("Should revert if ERC20 safeTransfer returns false", async function () {
            await lpStaking.connect(user1).stake(ethers.parseEther("50"), await this.fakeToken.getAddress());
            await lpStaking.connect(user1).unlock(await this.fakeToken.getAddress());
    
            // Fast forward time by 1 week
            await ethers.provider.send("evm_increaseTime", [604800]);
            await ethers.provider.send("evm_mine");
    
            await expect(lpStaking.connect(user1).unstake(await fakeToken.getAddress()))
                .to.be.revertedWith('SafeERC20: ERC20 operation did not succeed');
        });

        it("Should handle ERC20 tokens with transfer fees correctly on unstake", async function () {
            const FeeToken = await ethers.getContractFactory("FeeToken", owner);
            const feeToken = await FeeToken.deploy("Fee Token", "FEE", ethers.parseEther("1000").toString());
    
            await lpStaking.addLPTokenSupport(await feeToken.getAddress());
            await feeToken.transfer(user1.address, ethers.parseEther("100"));
            await feeToken.connect(user1).approve(lpStaking.getAddress(), ethers.parseEther("50"));
            await lpStaking.connect(user1).stake(ethers.parseEther("50"), await feeToken.getAddress());
            await lpStaking.connect(user1).unlock(await feeToken.getAddress());
    
            // Fast forward time by 1 week
            await ethers.provider.send("evm_increaseTime", [604800]);
            await ethers.provider.send("evm_mine");
    
            await lpStaking.connect(user1).unstake(await feeToken.getAddress());
    
            const userBalance = await feeToken.balanceOf(user1.address);
    
            // Check that the actual received amount is less due to the transfer fee
            expect(userBalance).to.be.lessThan(ethers.parseEther("100"));
        });

    });

    describe("Pause/Unpause", function () {
        beforeEach(async function () {
            await lpStaking.addLPTokenSupport(await token.getAddress());
            await token.transfer(user1.address, ethers.parseEther("100"));
            await token.connect(user1).approve(lpStaking.getAddress(), ethers.parseEther("50"));
        });

        it("Should pause the contract", async function () {
            await lpStaking.connect(hexagate).pause();
            expect(await lpStaking.paused()).to.be.true;
        });

        it("Should unpause the contract", async function () {
            await lpStaking.connect(hexagate).pause();
            await lpStaking.connect(hexagate).unpause();
            expect(await lpStaking.paused()).to.be.false;
        });

        it("Should revert if not Hexagate", async function () {
            await expect(lpStaking.connect(user1).pause()).to.be.revertedWith("Not Hexagate");
        });

        it("Should revert stake when paused", async function () {
            await lpStaking.connect(hexagate).pause();
            await expect(lpStaking.connect(user1).stake(ethers.parseEther("50"), await token.getAddress()))
                .to.be.revertedWith("Contract is paused");
        });

        it("Should revert unlock when paused", async function () {
            await lpStaking.connect(hexagate).pause();
            await expect(lpStaking.connect(user1).unlock(await token.getAddress()))
                .to.be.revertedWith("Contract is paused");
        });

        it("Should revert unstake when paused", async function () {
            await lpStaking.connect(hexagate).pause();
            await expect(lpStaking.connect(user1).unstake(await token.getAddress()))
                .to.be.revertedWith("Contract is paused");
        });
    });
});