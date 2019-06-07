
const nearlib = require('../lib/index');
const testUtils = require('./test-utils');
const fs = require('fs');

let connection;
let masterAccount;
let workingAccount;
let contractId;
let contract;

const HELLO_WASM_PATH = process.env.HELLO_WASM_PATH || '../nearcore/tests/hello.wasm';

jasmine.DEFAULT_TIMEOUT_INTERVAL = 10000;

async function deployContract(contractId) {
    const newPublicKey = await connection.signer.createKey(contractId, testUtils.networkId);
    const data = [...fs.readFileSync(HELLO_WASM_PATH)];
    await workingAccount.createAndDeployContract(contractId, newPublicKey, data, BigInt(100000));
    return new nearlib.Contract(workingAccount, contractId, { viewMethods: ['getValue'], changeMethods: ['setValue'] });
}

beforeAll(async () => {
    ({ connection, masterAccount } = await testUtils.setUpTestConnection());
});

beforeEach(async () => {
    contractId = 'test_contract_' + Date.now();
    workingAccount = await testUtils.createAccount(connection, masterAccount);
    contract = await deployContract(contractId);
});

test('make function call using access key', async() => {
    const keyPair = nearlib.utils.KeyPair.fromRandom('ed25519');
    await workingAccount.addKey(keyPair.getPublicKey(), contractId, '', '', 400000);

    // Override in the key store the workingAccount key to the given access key.
    await connection.signer.keyStore.setKey(testUtils.networkId, workingAccount.accountId, keyPair);
    const setCallValue = testUtils.generateUniqueString('setCallPrefix');
    await contract.setValue({value: setCallValue});
    expect(await contract.getValue()).toEqual(setCallValue);
});

test('remove access key no longer works', async() => {
    const keyPair = nearlib.utils.KeyPair.fromRandom('ed25519');
    await workingAccount.addKey(keyPair.getPublicKey(), contractId, '', '', 400000);
    await workingAccount.deleteKey(keyPair.getPublicKey());
    // Override in the key store the workingAccount key to the given access key.
    await connection.signer.keyStore.setKey(testUtils.networkId, workingAccount.accountId, keyPair);
    await expect(contract.setValue({ value: "test" })).rejects.toThrow(/\[-32000\] Server error: Transaction is not signed with a public key of the originator .+/);
});

test('view account details after adding access keys', async() => {
    const keyPair = nearlib.utils.KeyPair.fromRandom('ed25519');
    await workingAccount.addKey(keyPair.getPublicKey(), contractId, '', '', 1000000000);

    const contract2 = await deployContract('test_contract2_' + Date.now());
    const keyPair2 = nearlib.utils.KeyPair.fromRandom('ed25519');
    await workingAccount.addKey(keyPair2.getPublicKey(), contract2.contractId, '', '', 2000000000);

    const details = await workingAccount.getAccountDetails();
    const expectedResult = {
        authorizedApps: [{
            contractId: contractId,
            amount: 1000000000,
            publicKey: keyPair.getPublicKey(),
        },
        {
            contractId: contract2.contractId,
            amount: 2000000000,
            publicKey: keyPair2.getPublicKey(),
        }],
        transactions: []
    };
    expect(details.authorizedApps).toEqual(jasmine.arrayContaining(expectedResult.authorizedApps));
});