import {
    Contract,
    MockNetworkProvider,
    SignatureTemplate,
    TransactionBuilder,
    randomUtxo,
    randomToken,
} from 'cashscript';
import {
    instantiateSecp256k1,
    instantiateRipemd160,
    instantiateSha256,
    generatePrivateKey,
    binToHex,
    encodeCashAddress,
    decodeCashAddress
} from '@bitauth/libauth';

import perpetuity from './art/perpetuity.json' with { type: 'json' };

const secp256k1 = await instantiateSecp256k1();
const ripemd160 = await instantiateRipemd160();
const sha256 = await instantiateSha256();

const network = 'mocknet';

const generateWallet = () => {
    const privateKey = generatePrivateKey();
    const pubKeyBin = secp256k1.derivePublicKeyCompressed(privateKey);
    const pubKeyHex = binToHex(pubKeyBin);
    const signatureTemplate = new SignatureTemplate(privateKey);
    const pubKeyHash = ripemd160.hash(sha256.hash(pubKeyBin));
    const encoded = encodeCashAddress({ prefix: network === 'mainnet' ? 'bitcoincash' : 'bchtest', type: 'p2pkhWithTokens', payload: pubKeyHash });
    return { privateKey, pubKeyHex, signatureTemplate, address: typeof encoded === 'string' ? encoded : encoded.address };
};

const getPubKeyHex = address => {
    const pubKey = decodeCashAddress(address);
    console.log('attempting', pubKey);
    const pubKeyHex = binToHex(pubKey.payload);
    return pubKeyHex;
}

const users = ['bchtest:zp7jqy9vprhaaezkew5cvk93enmnv325ng9m0p4ygy']; // watch list
const user = { address: users[0], pubKeyHex: getPubKeyHex(users[0]) }; // just work on the first for now
const service = generateWallet();

const provider = new MockNetworkProvider({ updateUtxoSet: false });
const contract = new Contract(perpetuity, [user.pubKeyHex], { provider });
const perpetuityUtxo = randomUtxo({
    amount: 1000n,
    token: randomToken({
        amount: 10000000n,
    }),
});
const feesUtxo = randomUtxo();

provider.addUtxo(contract.address, perpetuityUtxo);
provider.addUtxo(service.address, feesUtxo);

const bigIntMax = (...args) => args.reduce((m, e) => e > m ? e : m);

const initial = perpetuityUtxo.token.amount;
const payout = bigIntMax(1n, (initial / 100n) * 2n);
const fee = bigIntMax(1n, initial / 1000n);
const remainder = initial - payout - fee;

if(remainder > 0) {
    await new TransactionBuilder({ provider })
        .addInput(perpetuityUtxo, contract.unlock.release())
        .addInput(feesUtxo, service.signatureTemplate.unlockP2PKH())
        .addOutput({ to: user.address, amount: 1000n, token: { amount: payout, category: perpetuityUtxo.token.category } })
        .addOutput({ to: contract.tokenAddress, amount: 1000n, token: { amount: remainder, category: perpetuityUtxo.token.category } })
        .addOutput({ to: service.address, amount: 1000n, token: { amount: fee, category: perpetuityUtxo.token.category } })
        .send();
} else {
    if(initial - payout > 0) {
        await new TransactionBuilder({ provider })
            .addInput(perpetuityUtxo, contract.unlock.release())
            .addInput(feesUtxo, service.signatureTemplate.unlockP2PKH())
            .addOutput({ to: user.address, amount: 1000n, token: { amount: payout, category: perpetuityUtxo.token.category } })
            .addOutput({ to: service.address, amount: 1000n, token: { amount: initial - payout, category: perpetuityUtxo.token.category } })
            .send();
    } else {
        await new TransactionBuilder({ provider })
            .addInput(perpetuityUtxo, contract.unlock.release())
            .addInput(feesUtxo, service.signatureTemplate.unlockP2PKH())
            .addOutput({ to: user.address, amount: 1000n, token: { amount: payout, category: perpetuityUtxo.token.category } })
            .addOutput({ to: service.address, amount: 1000n })
            .send();
    }
}
