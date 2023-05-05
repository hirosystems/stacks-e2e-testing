export namespace Constants {
  export const DEVNET_DEFAULT_EPOCH_2_0 = 100;
  export const DEVNET_DEFAULT_EPOCH_2_05 = 102;
  export const DEVNET_DEFAULT_EPOCH_2_1 = 106;
  export const DEVNET_DEFAULT_POX_2_ACTIVATION = 110;
  export const DEVNET_DEFAULT_EPOCH_2_2 = 122;
  export const DEVNET_DEFAULT_EPOCH_2_3 = 128;
  export const DEVNET_DEFAULT_EPOCH_2_4 = 134;
  export const BITCOIN_BLOCK_TIME = 10_000;

  export const CUSTOM_STACKS_NODE_IMAGE_URL =
    "blockstack/stacks-blockchain:2.4.0.0.0-devnet-0";
}

export const DEFAULT_FEE = 2000;

interface Contract {
  address: string;
  name: string;
}

interface PoxVersions {
  [key: number]: Contract;
}

export namespace Contracts {
  export const POX_1 = {
    address: "ST000000000000000000002AMW42H",
    name: "pox",
  };
  export const POX_2 = {
    address: "ST000000000000000000002AMW42H",
    name: "pox-2",
  };
  export const POX_3 = {
    address: "ST000000000000000000002AMW42H",
    name: "pox-3",
  };
  export const DEFAULT = POX_3;
  export const POX: PoxVersions = {
    1: POX_1,
    2: POX_2,
    3: POX_3,
  };
}

export namespace Accounts {
  export const DEPLOYER = {
    stxAddress: "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM",
    btcAddress: "mqVnk6NPRdhntvfm4hh9vvjiRkFDUuSYsH",
    secretKey:
      "753b7cc01a1a2e86221266a154af739463fce51219d97e4f856cd7200c3bd2a601",
  };
  export const WALLET_1 = {
    stxAddress: "ST1SJ3DTE5DN7X54YDH5D64R3BCB6A2AG2ZQ8YPD5",
    btcAddress: "mr1iPkD9N3RJZZxXRk7xF9d36gffa6exNC",
    secretKey:
      "7287ba251d44a4d3fd9276c88ce34c5c52a038955511cccaf77e61068649c17801",
  };
  export const WALLET_2 = {
    stxAddress: "ST2CY5V39NHDPWSXMW9QDT3HC3GD6Q6XX4CFRK9AG",
    btcAddress: "muYdXKmX9bByAueDe6KFfHd5Ff1gdN9ErG",
    secretKey:
      "530d9f61984c888536871c6573073bdfc0058896dc1adfe9a6a10dfacadc209101",
  };
  export const WALLET_3 = {
    stxAddress: "ST2JHG361ZXG51QTKY2NQCVBPPRRE2KZB1HR05NNC",
    btcAddress: "mvZtbibDAAA3WLpY7zXXFqRa3T4XSknBX7",
    secretKey:
      "d655b2523bcd65e34889725c73064feb17ceb796831c0e111ba1a552b0f31b3901",
  };
  export const FAUCET = {
    stxAddress: "STNHKEPYEPJ8ET55ZZ0M5A34J0R3N5FM2CMMMAZ6",
    btcAddress: "mjSrB3wS4xab3kYqFktwBzfTdPg367ZJ2d",
    secretKey:
      "de433bdfa14ec43aa1098d5be594c8ffb20a31485ff9de2923b2689471c401b801",
  };
}
