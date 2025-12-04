// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import { FHE, euint32, ebool } from "@fhevm/solidity/lib/FHE.sol";
import { SepoliaConfig } from "@fhevm/solidity/config/ZamaConfig.sol";

contract ChronotypeAnalysis_FHE is SepoliaConfig {
    struct EncryptedDNA {
        uint256 userId;
        euint32 encryptedGene1;
        euint32 encryptedGene2;
        euint32 encryptedGene3;
        euint32 encryptedGene4;
        uint256 timestamp;
    }

    struct DecryptedDNA {
        uint32 gene1;
        uint32 gene2;
        uint32 gene3;
        uint32 gene4;
        bool isRevealed;
    }

    struct ChronotypeProfile {
        euint32 sleepScore;
        euint32 morningnessScore;
        euint32 eveningnessScore;
        euint32 adaptabilityScore;
    }

    uint256 public userCount;
    mapping(uint256 => EncryptedDNA) public encryptedDNAs;
    mapping(uint256 => DecryptedDNA) public decryptedDNAs;
    mapping(uint256 => ChronotypeProfile) public chronotypeProfiles;

    mapping(uint256 => uint256) private requestToUserId;
    
    event DNASubmitted(uint256 indexed userId, uint256 timestamp);
    event AnalysisCompleted(uint256 indexed userId);
    event DNADecrypted(uint256 indexed userId);

    function registerUser() public returns (uint256) {
        userCount += 1;
        return userCount;
    }

    function submitEncryptedDNA(
        euint32 encryptedGene1,
        euint32 encryptedGene2,
        euint32 encryptedGene3,
        euint32 encryptedGene4
    ) public {
        uint256 userId = getUserId(msg.sender);
        
        encryptedDNAs[userId] = EncryptedDNA({
            userId: userId,
            encryptedGene1: encryptedGene1,
            encryptedGene2: encryptedGene2,
            encryptedGene3: encryptedGene3,
            encryptedGene4: encryptedGene4,
            timestamp: block.timestamp
        });

        decryptedDNAs[userId] = DecryptedDNA({
            gene1: 0,
            gene2: 0,
            gene3: 0,
            gene4: 0,
            isRevealed: false
        });

        analyzeChronotype(userId);
        emit DNASubmitted(userId, block.timestamp);
    }

    function analyzeChronotype(uint256 userId) private {
        EncryptedDNA storage dna = encryptedDNAs[userId];
        
        chronotypeProfiles[userId] = ChronotypeProfile({
            sleepScore: FHE.add(
                FHE.mul(dna.encryptedGene1, FHE.asEuint32(3)),
                FHE.mul(dna.encryptedGene2, FHE.asEuint32(2))
            ),
            morningnessScore: FHE.div(
                FHE.add(dna.encryptedGene3, dna.encryptedGene4),
                FHE.asEuint32(2)
            ),
            eveningnessScore: FHE.sub(
                FHE.asEuint32(100),
                FHE.div(
                    FHE.add(dna.encryptedGene3, dna.encryptedGene4),
                    FHE.asEuint32(2)
                )
            ),
            adaptabilityScore: FHE.mul(
                FHE.add(dna.encryptedGene1, dna.encryptedGene2),
                FHE.asEuint32(2)
            )
        });

        emit AnalysisCompleted(userId);
    }

    function requestDNADecryption(uint256 userId) public {
        require(msg.sender == getUserAddress(userId), "Not user");
        require(!decryptedDNAs[userId].isRevealed, "Already decrypted");

        EncryptedDNA storage dna = encryptedDNAs[userId];
        
        bytes32[] memory ciphertexts = new bytes32[](4);
        ciphertexts[0] = FHE.toBytes32(dna.encryptedGene1);
        ciphertexts[1] = FHE.toBytes32(dna.encryptedGene2);
        ciphertexts[2] = FHE.toBytes32(dna.encryptedGene3);
        ciphertexts[3] = FHE.toBytes32(dna.encryptedGene4);
        
        uint256 reqId = FHE.requestDecryption(ciphertexts, this.decryptDNA.selector);
        requestToUserId[reqId] = userId;
    }

    function decryptDNA(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        uint256 userId = requestToUserId[requestId];
        require(userId != 0, "Invalid request");

        DecryptedDNA storage dDNA = decryptedDNAs[userId];
        require(!dDNA.isRevealed, "Already decrypted");

        FHE.checkSignatures(requestId, cleartexts, proof);

        (uint32 gene1, uint32 gene2, uint32 gene3, uint32 gene4) = 
            abi.decode(cleartexts, (uint32, uint32, uint32, uint32));
        
        dDNA.gene1 = gene1;
        dDNA.gene2 = gene2;
        dDNA.gene3 = gene3;
        dDNA.gene4 = gene4;
        dDNA.isRevealed = true;

        emit DNADecrypted(userId);
    }

    function requestProfileDecryption(uint256 userId) public {
        require(msg.sender == getUserAddress(userId), "Not user");
        ChronotypeProfile storage profile = chronotypeProfiles[userId];
        
        bytes32[] memory ciphertexts = new bytes32[](4);
        ciphertexts[0] = FHE.toBytes32(profile.sleepScore);
        ciphertexts[1] = FHE.toBytes32(profile.morningnessScore);
        ciphertexts[2] = FHE.toBytes32(profile.eveningnessScore);
        ciphertexts[3] = FHE.toBytes32(profile.adaptabilityScore);
        
        FHE.requestDecryption(ciphertexts, this.decryptProfile.selector);
    }

    function decryptProfile(
        uint256 requestId,
        bytes memory cleartexts,
        bytes memory proof
    ) public {
        FHE.checkSignatures(requestId, cleartexts, proof);
        (uint32 sleep, uint32 morning, uint32 evening, uint32 adapt) = 
            abi.decode(cleartexts, (uint32, uint32, uint32, uint32));
        // Process decrypted profile as needed
    }

    mapping(address => uint256) private addressToUserId;
    mapping(uint256 => address) private userIdToAddress;

    function getUserId(address userAddress) private returns (uint256) {
        if (addressToUserId[userAddress] == 0) {
            uint256 newId = registerUser();
            addressToUserId[userAddress] = newId;
            userIdToAddress[newId] = userAddress;
            return newId;
        }
        return addressToUserId[userAddress];
    }

    function getUserAddress(uint256 userId) private view returns (address) {
        return userIdToAddress[userId];
    }
}