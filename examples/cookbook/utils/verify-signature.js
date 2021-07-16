const { connect, keyStores } = require("near-api-js");
const path = require("path");
const homedir = require("os").homedir();
const nacl = require("tweetnacl");
const sha256 = require("js-sha256");

const ACCOUNT_ID = "near-example.testnet";
const CREDENTIALS_DIR = ".near-credentials";

const credentialsPath = path.join(homedir, CREDENTIALS_DIR);
const keyStore = new keyStores.UnencryptedFileSystemKeyStore(credentialsPath);

const config = {
    keyStore,
    networkId: "testnet",
    nodeUrl: "https://rpc.testnet.near.org",
};

verifySignature();

async function verifySignature() {
    const near = await connect(config);
    const account = await near.account(ACCOUNT_ID);
    const tokenMessage = new TextEncoder().encode(`Hello world, ${ACCOUNT_ID}`);
    const signatureData = await account.connection.signer.signMessage(
        tokenMessage,
        ACCOUNT_ID,
        config.networkId
    );
    const hash = new Uint8Array(sha256.sha256.array(tokenMessage));
    let isValid = nacl.sign.detached.verify(
        hash,
        signatureData.signature,
        signatureData.publicKey.data
    );
    console.log("Signature Valid?:", isValid);
    return isValid;
}
