import { expect } from "chai";
import { ethers } from "hardhat";
import { MockERC1155, LPStaking } from "../scripts/@types/index";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("LPStaking", function () {
    let lpStaking: LPStaking;
    let owner: HardhatEthersSigner;
    let hexagate: HardhatEthersSigner;
    let user1: HardhatEthersSigner;
    let user2: HardhatEthersSigner;
    let token: MockERC1155;
    const tokenId = 1;
    const amount = 100;

    beforeEach(async function () {
        [owner, hexagate, user1, user2] = await ethers.getSigners();

        const ERC1155Mock = await ethers.getContractFactory("MockERC1155", owner);
        token = await ERC1155Mock.deploy();
        await token.deployed();

        const LPStaking = await ethers.getContractFactory("LPStaking", owner);
        lpStaking = await ethers.deployProxy(LPStaking, [hexagate.address]);
        await lpStaking.deployed();

        await token.mint(user1.address, tokenId, amount, "0x");
    });

    describe("Initialization", function () {
        it("should set hexagate address correctly", async function () {
            expect(await lpStaking.hexagate()).to.equal(hexagate.address);
        });
    });

    describe("Token support", function () {
        it("should allow owner to add and remove token support", async function () {
            await lpStaking.connect(owner).addLPTokenSupport(await token.getAddress());
            expect(await lpStaking.supportedLPTokens(await token.getAddress())).to.be.true;

            await lpStaking.connect(owner).removeLPTokenSupport(await token.getAddress());
            expect(await lpStaking.supportedLPTokens(await token.getAddress())).to.be.false;
        });

        it("should not allow non-owner to add or remove token support", async function () {
            await expect(lpStaking.connect(user1).addLPTokenSupport(await token.getAddress())).to.be.revertedWith("Ownable: caller is not the owner");
            await expect(lpStaking.connect(user1).removeLPTokenSupport(await token.getAddress())).to.be.revertedWith("Ownable: caller is not the owner");
        });
    });

    describe("Staking", function () {
        beforeEach(async function () {
            await lpStaking.connect(owner).addLPTokenSupport(await token.getAddress());
            await token.connect(user1).setApprovalForAll(lpStaking.address, true);
        });

        it("should allow user to stake supported tokens", async function () {
            await lpStaking.connect(user1).stake(amount, await token.getAddress(), tokenId);

            const balance = await lpStaking.balanceOf(await token.getAddress(), tokenId, user1.address);
            expect(balance).to.equal(amount);
        });

        it("should emit Staked event on successful staking", async function () {
            await expect(lpStaking.connect(user1).stake(amount, await token.getAddress(), tokenId))
                .to.emit(lpStaking, "Staked")
                .withArgs(user1.address, amount, await token.getAddress(), tokenId);
        });

        it("should not allow staking of unsupported tokens", async function () {
            const unsupportedToken = await ethers.getContractFactory("MockERC1155", owner);
            const anotherToken = await unsupportedToken.deploy();
            await anotherToken.deployed();
            await anotherToken.mint(user1.address, tokenId, amount, "0x");

            await anotherToken.connect(user1).setApprovalForAll(lpStaking.address, true);
            await expect(lpStaking.connect(user1).stake(amount, anotherawait token.getAddress(), tokenId)).to.be.revertedWith("Token not supported");
        });
    });

    describe("Unlocking", function () {
        beforeEach(async function () {
            await lpStaking.connect(owner).addLPTokenSupport(await token.getAddress());
            await token.connect(user1).setApprovalForAll(lpStaking.address, true);
            await lpStaking.connect(user1).stake(amount, await token.getAddress(), tokenId);
        });

        it("should allow user to unlock staked tokens", async function () {
            await lpStaking.connect(user1).unlock(amount, await token.getAddress(), tokenId);

            const unlock = await lpStaking.userUnlocks(user1.address, await token.getAddress(), tokenId);
            expect(unlock.amount).to.equal(amount);
            expect(unlock.token).to.equal(await token.getAddress());
            expect(unlock.tokenId).to.equal(tokenId);
        });

        it("should emit UnlockStarted event on successful unlock", async function () {
            const unlockAt = (await ethers.provider.getBlock("latest")).timestamp + 604800; // 1 week

            await expect(lpStaking.connect(user1).unlock(amount, await token.getAddress(), tokenId))
                .to.emit(lpStaking, "UnlockStarted")
                .withArgs(user1.address, amount, await token.getAddress(), tokenId, unlockAt);
        });

        it("should not allow unlocking of unsupported tokens", async function () {
            const unsupportedToken = await ethers.getContractFactory("MockERC1155", owner);
            const anotherToken = await unsupportedToken.deploy();
            await anotherToken.deployed();
            await anotherToken.mint(user1.address, tokenId, amount, "0x");

            await anotherToken.connect(user1).setApprovalForAll(lpStaking.address, true);
            await expect(lpStaking.connect(user1).unlock(amount, anotherawait token.getAddress(), tokenId)).to.be.revertedWith("Token not supported");
        });
    });

    describe("Unstaking", function () {
        beforeEach(async function () {
            await lpStaking.connect(owner).addLPTokenSupport(await token.getAddress());
            await token.connect(user1).setApprovalForAll(lpStaking.address, true);
            await lpStaking.connect(user1).stake(amount, await token.getAddress(), tokenId);
            await lpStaking.connect(user1).unlock(amount, await token.getAddress(), tokenId);
        });

        it("should allow user to unstake unlocked tokens after unlock duration", async function () {
            await ethers.provider.send("evm_increaseTime", [604800]); // 1 week
            await ethers.provider.send("evm_mine", []);

            await lpStaking.connect(user1).unstake(amount, await token.getAddress(), tokenId);

            const balance = await lpStaking.balanceOf(await token.getAddress(), tokenId, user1.address);
            expect(balance).to.equal(0);

            const userBalance = await token.balanceOf(user1.address, tokenId);
            expect(userBalance).to.equal(amount);
        });

        it("should emit Unstaked event on successful unstaking", async function () {
            await ethers.provider.send("evm_increaseTime", [604800]); // 1 week
            await ethers.provider.send("evm_mine", []);

            await expect(lpStaking.connect(user1).unstake(amount, await token.getAddress(), tokenId))
                .to.emit(lpStaking, "Unstaked")
                .withArgs(user1.address, amount, await token.getAddress(), tokenId);
        });

        it("should not allow unstaking before unlock duration", async function () {
            await expect(lpStaking.connect(user1).unstake(amount, await token.getAddress(), tokenId)).to.be.revertedWith("Unlock period not completed");
        });

        it("should not allow unstaking of unsupported tokens", async function () {
            const unsupportedToken = await ethers.getContractFactory("MockERC1155", owner);
            const anotherToken = await unsupportedToken.deploy();
            await anotherToken.deployed();
            await anotherToken.mint(user1.address, tokenId, amount, "0x");

            await anotherToken.connect(user1).setApprovalForAll(lpStaking.address, true);
            await expect(lpStaking.connect(user1).unstake(amount, anotherawait token.getAddress(), tokenId)).to.be.revertedWith("Token not supported");
        });
    });

    describe("Pausing", function () {
        beforeEach(async function () {
            await lpStaking.connect(owner).addLPTokenSupport(await token.getAddress());
            await token.connect(user1).setApprovalForAll(lpStaking.address, true);
        });

        it("should allow hexagate to pause and unpause the contract", async function () {
            await lpStaking.connect(hexagate).pause();
            expect(await lpStaking.paused()).to.be.true;

            await lpStaking.connect(hexagate).unpause();
            expect(await lpStaking.paused()).to.be.false;
        });

        it("should not allow staking, unlocking, or unstaking while paused", async function () {
            await lpStaking.connect(hexagate).pause();

            await expect(lpStaking.connect(user1).stake(amount, await token.getAddress(), tokenId)).to.be.revertedWith("Contract is paused");
            await expect(lpStaking.connect(user1).unlock(amount, await token.getAddress(), tokenId)).to.be.revertedWith("Contract is paused");

            await lpStaking.connect(hexagate).unpause();
            await lpStaking.connect(user1).stake(amount, await token.getAddress(), tokenId);
            await lpStaking.connect(user1).unlock(amount, await token.getAddress(), tokenId);

            await lpStaking.connect(hexagate).pause();
            await expect(lpStaking.connect(user1).unstake(amount, await token.getAddress(), tokenId)).to.be.revertedWith("Contract is paused");
        });
    });
});
