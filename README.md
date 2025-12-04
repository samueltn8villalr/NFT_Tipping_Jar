# NFT Tipping Jar: Privacy-Preserving Social Tipping for NFT Artists

NFT Tipping Jar is a revolutionary tool that allows fans to privately tip NFT artists while adding a layer of interaction through encrypted messages. This project's core functionality is powered by **Zama's Fully Homomorphic Encryption technology**, ensuring both privacy and creativity in the vibrant NFT ecosystem.

## Addressing the Privacy Dilemma

In today’s digital landscape, creators often struggle with maintaining their privacy while interacting with fans. Artists face the challenge of receiving support from their audience without compromising their personal data. Traditional tipping mechanisms expose recipients to potential privacy breaches, making both creators and fans hesitant to engage fully. NFT Tipping Jar addresses this concern by providing a secure platform where fans can tip artists anonymously, enabling a more enriching and fearless interaction.

## The FHE Solution: Empowering Privacy with Zama

Fully Homomorphic Encryption (FHE) offers a groundbreaking solution to the challenges of privacy in social interactions. With Zama's open-source libraries such as **Concrete** and the **zama-fhe SDK**, NFT Tipping Jar implements a system where tips and accompanying messages are encrypted, safeguarding user data while allowing meaningful engagement. This encryption means artists can receive valuable feedback and tips without exposing the identities of their supporters, all while enhancing the metadata of their NFTs with hidden comments.

## Core Features

- **Encrypted Tipping**: Fans can send tips to NFT artists while attaching FHE-encrypted messages, ensuring their identities remain anonymous.
- **Invisible Comments**: Encrypted messages can be added to NFT metadata, creating hidden layers of interaction and commentary.
- **Artist-Fan Interaction**: Strengthens the bond between creators and their audiences by fostering a safe and private space for communication.
- **Marketplace Integration**: A seamless tipping button can be integrated into existing NFT marketplace pages, enhancing artists' exposure and income streams.

## Technology Stack

- **Zama SDKs**: 
  - Concrete
  - Zama-fhe SDK
- **Blockchain**: Ethereum
- **Smart Contracts**: Solidity
- **Environment**: Node.js
- **Development Frameworks**: Hardhat

## Project Directory Structure

Here’s the structure of the NFT Tipping Jar project:

```
NFT_Tipping_Jar/
├── contracts/
│   └── NFT_Tipping_Jar.sol
├── scripts/
│   └── deploy.js
├── test/
│   └── NFT_Tipping_Jar.test.js
├── package.json
└── README.md
```

## Installation Guide

To set up NFT Tipping Jar, follow these steps:

1. Make sure you have **Node.js** and **Hardhat** installed on your machine.
2. After downloading the project, navigate to the project directory in your terminal.
3. Run the following command to install the required dependencies, including Zama FHE libraries:
   ```bash
   npm install
   ```

## Build & Run Guide

Once everything is set up, you can compile the smart contracts and run tests. Use the following commands:

1. To compile the smart contracts:
   ```bash
   npx hardhat compile
   ```

2. To run the tests:
   ```bash
   npx hardhat test
   ```

3. To deploy the contracts to a local network:
   ```bash
   npx hardhat run scripts/deploy.js --network localhost
   ```

## Example Usage

Here’s a code snippet demonstrating how to create a new tip with an encrypted message:

```javascript
const { encryptMessage } = require('zama-fhe-sdk');

// Encrypt a message for the artist
const message = "Your art is amazing!";
const encryptedMessage = encryptMessage(message, artistPublicKey);

// Send tip to the artist with the encrypted message
const sendTip = async (artistAddress, amount) => {
  await tippingJarContract.sendTip(artistAddress, encryptedMessage, {
    value: amount
  });
};

// Example call
sendTip('0xArtistAddress123...', ethers.utils.parseEther('0.05'));
```

In this code, we encrypt a message before sending it as a tip to an artist, exemplifying the seamless interaction NFT Tipping Jar enables.

## Acknowledgements

### Powered by Zama

We would like to express our heartfelt gratitude to the Zama team for their pioneering work in the field of Fully Homomorphic Encryption and their open-source tools. These innovations make it possible for projects like NFT Tipping Jar to enhance privacy, creativity, and engagement in the blockchain ecosystem.

---

By utilizing NFT Tipping Jar, both artists and fans can enjoy a richer, more secure connection in the thriving world of NFTs, all thanks to Zama’s cutting-edge technology.
