import { expect } from "chai";
import { ethers } from "hardhat";
import { MockERC20, LPStaking } from "../scripts/@types/index";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

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
    });

    describe("Unlocking", function () {
        beforeEach(async function () {
            await lpStaking.addLPTokenSupport(await token.getAddress());
            await token.transfer(user1.address, ethers.parseEther("100"));
            await token.connect(user1).approve(lpStaking.getAddress(), ethers.parseEther("50"));
            await lpStaking.connect(user1).stake(ethers.parseEther("50"), await token.getAddress());
        });

        it("Should unlock tokens correctly", async function () {
            await lpStaking.connect(user1).unlock(ethers.parseEther("25"), await token.getAddress());
            const unlockInfo = await lpStaking.userUnlocks(user1.address, await token.getAddress());

            expect(unlockInfo.amount).to.equal(ethers.parseEther("25"));
        });

        // it("Should emit UnlockStarted event", async function () {
        //     const block = await ethers.provider.getBlock("latest");
        //     if (block) {
        //         const unlockTime = block.timestamp + 604800; // 604800 is the number of seconds in one week
        //         await expect(lpStaking.connect(user1).unlock(ethers.parseEther("25"), await token.getAddress()))
        //         .to.emit(lpStaking, "UnlockStarted")
        //         .withArgs(user1.address, ethers.parseEther("25"), await token.getAddress(), unlockTime);
        //     } else {
        //         console.error("Failed to fetch the latest block.");
        //     }
        // });

        it("Should revert if token is not supported", async function () {
            await expect(lpStaking.connect(user1).unlock(ethers.parseEther("25"), user2.address))
                .to.be.revertedWith("Token not supported");
        });

        it("Should revert if amount is zero", async function () {
            await expect(lpStaking.connect(user1).unlock(0, await token.getAddress())).to.be.revertedWith("Amount must be greater than zero");
        });

        it("Should revert if insufficient balance", async function () {
            await expect(lpStaking.connect(user1).unlock(ethers.parseEther("75"), await token.getAddress()))
                .to.be.revertedWith("Insufficient balance");
        });
    });

    describe("Unstaking", function () {
        beforeEach(async function () {
            await lpStaking.addLPTokenSupport(await token.getAddress());
            await token.transfer(user1.address, ethers.parseEther("100"));
            await token.connect(user1).approve(lpStaking.getAddress(), ethers.parseEther("50"));
            await lpStaking.connect(user1).stake(ethers.parseEther("50"), await token.getAddress());
            await lpStaking.connect(user1).unlock(ethers.parseEther("25"), await token.getAddress());

            // Fast forward time by 1 week
            await ethers.provider.send("evm_increaseTime", [604800]);
            await ethers.provider.send("evm_mine");
        });

        it("Should unstake tokens correctly", async function () {
            await lpStaking.connect(user1).unstake(ethers.parseEther("25"), await token.getAddress());

            expect(await token.balanceOf(user1.address)).to.equal(ethers.parseEther("75"));
            expect(await lpStaking.balanceOf(await token.getAddress(), user1.address)).to.equal(ethers.parseEther("25"));
        });

        it("Should emit Unstaked event", async function () {
            await expect(lpStaking.connect(user1).unstake(ethers.parseEther("25"), await token.getAddress()))
                .to.emit(lpStaking, "Unstaked")
                .withArgs(user1.address, ethers.parseEther("25"), await token.getAddress());
        });

        it("Should revert if token is not supported", async function () {
            await expect(lpStaking.connect(user1).unstake(ethers.parseEther("25"), user2.address))
                .to.be.revertedWith("Token not supported");
        });

        it("Should revert if amount is zero", async function () {
            await expect(lpStaking.connect(user1).unstake(0, await token.getAddress())).to.be.revertedWith("Amount must be greater than zero");
        });

        it("Should revert if unlock period not completed", async function () {
            await lpStaking.connect(user1).unlock(ethers.parseEther("10"), await token.getAddress());

            await expect(lpStaking.connect(user1).unstake(ethers.parseEther("10"), await token.getAddress()))
                .to.be.revertedWith("Unlock period not completed");
        });

        it("Should revert if insufficient unlocked amount", async function () {
            await expect(lpStaking.connect(user1).unstake(ethers.parseEther("50"), await token.getAddress()))
                .to.be.revertedWith("Insufficient unlocked amount");
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
            await expect(lpStaking.connect(user1).unlock(ethers.parseEther("25"), await token.getAddress()))
                .to.be.revertedWith("Contract is paused");
        });

        it("Should revert unstake when paused", async function () {
            await lpStaking.connect(hexagate).pause();
            await expect(lpStaking.connect(user1).unstake(ethers.parseEther("25"), await token.getAddress()))
                .to.be.revertedWith("Contract is paused");
        });
    });
});