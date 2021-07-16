const nearApi = require('../src/index');
const testUtils  = require('./test-utils');
const BN = require('bn.js');
const base58 = require('bs58');

jest.setTimeout(20000);

const withProvider = (fn) => {
    const config = Object.assign(require('./config')(process.env.NODE_ENV || 'test'));
    const provider = new nearApi.providers.JsonRpcProvider(config.nodeUrl);
    return () => fn(provider);
};

test('json rpc fetch node status', withProvider(async (provider) => {
    let response = await provider.status();
    expect(response.chain_id).toBeTruthy();
}));

test('json rpc fetch block info', withProvider(async (provider) => {
    let stat = await provider.status();
    let height = stat.sync_info.latest_block_height - 1;
    let response = await provider.block({ blockId: height });
    expect(response.header.height).toEqual(height);

    let sameBlock = await provider.block({ blockId: response.header.hash });
    expect(sameBlock.header.height).toEqual(height);

    let optimisticBlock = await provider.block({ finality: 'optimistic' });
    expect(optimisticBlock.header.height - height).toBeLessThan(5);

    let nearFinalBlock = await provider.block({ finality: 'near-final' });
    expect(nearFinalBlock.header.height - height).toBeLessThan(5);

    let finalBlock = await provider.block({ finality: 'final' });
    expect(finalBlock.header.height - height).toBeLessThan(5);

    let deprecatedStyle = await provider.block(height);
    expect(deprecatedStyle.header.height).toEqual(height);
}));

test('json rpc fetch block changes', withProvider(async (provider) => {
    let stat = await provider.status();
    let height = stat.sync_info.latest_block_height - 1;
    let response = await provider.blockChanges({ blockId: height });

    expect(response).toMatchObject({
        block_hash: expect.any(String),
        changes: expect.any(Array)
    });
}));

test('json rpc fetch chunk info', withProvider(async (provider) => {
    let stat = await provider.status();
    let height = stat.sync_info.latest_block_height - 1;
    let response = await provider.chunk([height, 0]);
    expect(response.header.shard_id).toEqual(0);
    let sameChunk = await provider.chunk(response.header.chunk_hash);
    expect(sameChunk.header.chunk_hash).toEqual(response.header.chunk_hash);
    expect(sameChunk.header.shard_id).toEqual(0);
}));

test('json rpc fetch validators info', withProvider(async (provider) => {
    let validators = await provider.validators(null);
    expect(validators.current_validators.length).toBeGreaterThanOrEqual(1);
}));

test('txStatus with string hash and buffer hash', withProvider(async(provider) => {
    const near = await testUtils.setUpTestConnection();
    const sender = await testUtils.createAccount(near);
    const receiver = await testUtils.createAccount(near);
    const outcome = await sender.sendMoney(receiver.accountId, new BN('1'));

    const responseWithString = await provider.txStatus(outcome.transaction.hash, sender.accountId);
    const responseWithUint8Array = await provider.txStatus(base58.decode(outcome.transaction.hash), sender.accountId);
    expect(responseWithString).toMatchObject(outcome);
    expect(responseWithUint8Array).toMatchObject(outcome);
}));

test('json rpc query with blockId', withProvider(async(provider) => {
    const stat = await provider.status();
    let blockId = stat.sync_info.latest_block_height - 1;

    const response = await provider.query({
        blockId,
        request_type: 'view_account',
        account_id: 'test.near'
    });

    expect(response).toEqual({
        block_height: expect.any(Number),
        block_hash: expect.any(String),
        amount: expect.any(String),
        locked: expect.any(String),
        code_hash: '11111111111111111111111111111111',
        storage_usage: 182,
        storage_paid_at: 0,
    });
}));

test('json rpc query account', withProvider(async (provider) => {
    const near = await testUtils.setUpTestConnection();
    const account = await testUtils.createAccount(near);
    let response = await provider.query(`account/${account.accountId}`, '');
    expect(response.code_hash).toEqual('11111111111111111111111111111111');
}));

test('json rpc query view_state', withProvider(async (provider) => {
    const near = await testUtils.setUpTestConnection();
    const account = await testUtils.createAccount(near);
    const contract = await testUtils.deployContract(account, testUtils.generateUniqueString('test'));

    await contract.setValue({ args: { value: 'hello' } });

    return testUtils.waitFor(async() => {
        const response = await provider.query({
            request_type: 'view_state',
            finality: 'final',
            account_id: contract.contractId,
            prefix_base64: ''
        });
        expect(response).toEqual({
            block_height: expect.any(Number),
            block_hash: expect.any(String),
            values: [
                { key: 'bmFtZQ==', value: 'aGVsbG8=', proof: [] }
            ],
            proof: []
        });
    });
}));

test('json rpc query view_account', withProvider(async (provider) => {
    const response = await provider.query({
        request_type: 'view_account',
        finality: 'final',
        account_id: 'test.near'
    });

    expect(response).toEqual({
        block_height: expect.any(Number),
        block_hash: expect.any(String),
        amount: expect.any(String),
        locked: expect.any(String),
        code_hash: '11111111111111111111111111111111',
        storage_usage: 182,
        storage_paid_at: 0,
    });
}));

test('json rpc query view_code', withProvider(async (provider) => {
    const near = await testUtils.setUpTestConnection();
    const account = await testUtils.createAccount(near);
    const contract = await testUtils.deployContract(account, testUtils.generateUniqueString('test'));

    return testUtils.waitFor(async() => {
        const response = await provider.query({
            request_type: 'view_code',
            finality: 'final',
            account_id: contract.contractId
        });

        expect(response).toEqual({
            block_height: expect.any(Number),
            block_hash: expect.any(String),
            code_base64: expect.any(String),
            hash: expect.any(String)
        });
    });
}));

test('json rpc query call_function', withProvider(async (provider) => {
    const near = await testUtils.setUpTestConnection();
    const account = await testUtils.createAccount(near);
    const contract = await testUtils.deployContract(account, testUtils.generateUniqueString('test'));

    await contract.setValue({ args: { value: 'hello' } });

    return testUtils.waitFor(async() => {
        const response = await provider.query({
            request_type: 'call_function',
            finality: 'final',
            account_id: contract.contractId,
            method_name: 'getValue',
            args_base64: ''
        });
        expect(response).toEqual({
            block_height: expect.any(Number),
            block_hash: expect.any(String),
            logs: [],
            result: [
                34,
                104,
                101,
                108,
                108,
                111,
                34
            ]
        });
    });
}));

test('final tx result', async() => {
    const result = {
        status: { SuccessValue: 'e30=' },
        transaction: { id: '11111', outcome: { status: { SuccessReceiptId: '11112' }, logs: [], receipt_ids: ['11112'], gas_burnt: 1 } },
        receipts: [
            { id: '11112', outcome: { status: { SuccessValue: 'e30=' }, logs: [], receipt_ids: ['11112'], gas_burnt: 9001 } },
            { id: '11113', outcome: { status: { SuccessValue: '' }, logs: [], receipt_ids: [], gas_burnt: 0 } }
        ]
    };
    expect(nearApi.providers.getTransactionLastResult(result)).toEqual({});
});

test('final tx result with null', async() => {
    const result = {
        status: 'Failure',
        transaction: { id: '11111', outcome: { status: { SuccessReceiptId: '11112' }, logs: [], receipt_ids: ['11112'], gas_burnt: 1 } },
        receipts: [
            { id: '11112', outcome: { status: 'Failure', logs: [], receipt_ids: ['11112'], gas_burnt: 9001 } },
            { id: '11113', outcome: { status: { SuccessValue: '' }, logs: [], receipt_ids: [], gas_burnt: 0 } }
        ]
    };
    expect(nearApi.providers.getTransactionLastResult(result)).toEqual(null);
});

test('json rpc light client proof', async() => {
    const near = await testUtils.setUpTestConnection();
    const workingAccount = await testUtils.createAccount(near);
    const executionOutcome = await workingAccount.sendMoney(workingAccount.accountId, new BN(10000));
    const provider = near.connection.provider;

    async function waitForStatusMatching(isMatching) {
        const MAX_ATTEMPTS = 10;
        for (let i = 0; i < MAX_ATTEMPTS; i++) {
            await testUtils.sleep(500);
            const nodeStatus = await provider.status();
            if (isMatching(nodeStatus)) {
                return nodeStatus;
            }
        }
        throw new Error(`Exceeded ${MAX_ATTEMPTS} attempts waiting for matching node status.`);
    }

    const comittedStatus = await waitForStatusMatching(status =>
        status.sync_info.latest_block_hash !== executionOutcome.transaction_outcome.block_hash);
    const BLOCKS_UNTIL_FINAL = 2;
    const finalizedStatus = await waitForStatusMatching(status =>
        status.sync_info.latest_block_height > comittedStatus.sync_info.latest_block_height + BLOCKS_UNTIL_FINAL);

    const block = await provider.block({ blockId: finalizedStatus.sync_info.latest_block_hash });
    const lightClientHead = block.header.last_final_block;
    let lightClientRequest = {
        type: 'transaction',
        light_client_head: lightClientHead,
        transaction_hash: executionOutcome.transaction.hash,
        sender_id: workingAccount.accountId,
    };
    const lightClientProof = await provider.lightClientProof(lightClientRequest);
    expect('prev_block_hash' in lightClientProof.block_header_lite).toBe(true);
    expect('inner_rest_hash' in lightClientProof.block_header_lite).toBe(true);
    expect('inner_lite' in lightClientProof.block_header_lite).toBe(true);
    expect(lightClientProof.outcome_proof.id).toEqual(executionOutcome.transaction_outcome.id);
    expect('block_hash' in lightClientProof.outcome_proof).toBe(true);
    expect(lightClientProof.outcome_root_proof).toEqual([]);
    expect(lightClientProof.block_proof.length).toBeGreaterThan(0);

    // pass nonexistent hash for light client head will fail
    lightClientRequest = {
        type: 'transaction',
        light_client_head: '11111111111111111111111111111111',
        transaction_hash: executionOutcome.transaction.hash,
        sender_id: workingAccount.accountId,
    };
    await expect(provider.lightClientProof(lightClientRequest)).rejects.toThrow('DB Not Found Error');

    // Use old block hash as light client head should fail
    lightClientRequest = {
        type: 'transaction',
        light_client_head: executionOutcome.transaction_outcome.block_hash,
        transaction_hash: executionOutcome.transaction.hash,
        sender_id: workingAccount.accountId,
    };

    await expect(provider.lightClientProof(lightClientRequest)).rejects.toThrow(/.+ block .+ is ahead of head block .+/);
});

test('json rpc fetch genesis protocol config', withProvider(async (provider) => {
    const response = await provider.experimental_genesisConfig();
    expect('chain_id' in response).toBe(true);
    expect('genesis_height' in response).toBe(true);
    expect('runtime_config' in response).toBe(true);
    expect('storage_amount_per_byte' in response.runtime_config).toBe(true);
}));

test('json rpc fetch protocol config', withProvider(async (provider) => {
    const status = await provider.status();
    const blockHeight = status.sync_info.latest_block_height;
    const blockHash = status.sync_info.latest_block_hash;
    for (const blockReference of [{ sync_checkpoint: 'genesis' }, { block_id: blockHeight }, { block_id: blockHash }, { finality: 'final' }, { finality: 'optimistic' }]) {
        const response = await provider.experimental_protocolConfig(blockReference);
        expect('chain_id' in response).toBe(true);
        expect('genesis_height' in response).toBe(true);
        expect('runtime_config' in response).toBe(true);
        expect('storage_amount_per_byte' in response.runtime_config).toBe(true);
    }
}));

test('json rpc gas price', withProvider(async (provider) => {
    let status = await provider.status();
    let positiveIntegerRegex = /^[+]?\d+([.]\d+)?$/;

    let response1 = await provider.gasPrice(status.sync_info.latest_block_height);
    expect(response1.gas_price).toMatch(positiveIntegerRegex);

    let response2 = await provider.gasPrice(status.sync_info.latest_block_hash);
    expect(response2.gas_price).toMatch(positiveIntegerRegex);

    let response3 = await provider.gasPrice();
    expect(response3.gas_price).toMatch(positiveIntegerRegex);
}));
