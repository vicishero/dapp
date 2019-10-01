import { Meteor } from 'meteor/meteor';
import standardABI from 'human-standard-token-abi';
import { BigNumber } from 'bignumber.js';
import { resolve } from 'url';
import { wei2eth, getCoin } from '/imports/api/blockchain/modules/web3Util';

import { createUser, validateUsername } from '/imports/startup/both/modules/User';
import { migrateAddress } from '/lib/interpreter';


const Web3 = require('web3');
const ethUtil = require('ethereumjs-util');
const abiDecoder = require('abi-decoder');
const numeral = require('numeral');

const START_BLOCK = 5000000;
let web3;

// template
const template = {
  keyword: '{{keyword}}',
  collectiveId: '{{collectiveId}}',
  title: '{{title}}',
  kind: 'VOTE',
  context: 'GLOBAL',
  url: '{{url}}',
  description: '{{description}}',
  tags: [],
  membersOnly: false,
  permanentElection: true,
  executionStatus: 'OPEN',
  anonymous: false,
  signatures: [],
  alwaysOpen: false,
  allowForks: false,
  secretVotes: false,
  realtimeResults: false,
  multipleChoice: false,
  rankPreferences: false,
  executiveDecision: true,
  stage: 'LIVE',
  ballot: [],
  ballotEnabled: false,
  stakingEnabled: false,
  constituencyEnabled: false,
  constituency: [
    {
      kind: 'TOKEN',
      code: 'ETH',
      check: 'EQUAL',
    },
  ],
  authorized: false,
  isDefined: false,
  isRoot: true,
  events: [],
  wallet: {
    balance: 0,
    placed: 0,
    available: 0,
    currency: 'ETH',
    address: [],
    ledger: [],
  },
  tally: {
    lastTransaction: '',
    choice: [],
    voter: [],
  },
  blockchain: {
    coin: {
      code: 'ETH',
    },
    publicAddress: '{{publicAddress}}',
    votePrice: 0,
    tickets: [],
    score: {
      totalPending: 0,
      totalConfirmed: 0,
      totalFail: 0,
      value: 0,
      finalConfirmed: 0,
      finalPending: 0,
      finalFail: 0,
    },
  },
  geo: '{{geo}}',
  totalReplies: 0,
};

/**
* @summary check web3 plugin and connects to code obejct
*/
const _web3 = () => {
  if (!web3) {
    console.log('[web3] Connecting to Ethereum node...');
    web3 = new Web3(Meteor.settings.public.web3.network);
  }
  return web3;
};

/**
* @summary show all the transactions for a given public address
* @param {string} publicAddress of a contract.
*/
const _getContract = async (publicAddress, interfaceJSON) => {
  if (_web3()) {
    console.log(`[web3] Getting contract ABI of ${publicAddress}.`);
    const abi = JSON.parse(interfaceJSON);

    if (abi) {
      console.log(abi);
      const contract = new web3.eth.Contract(abi, publicAddress);
      console.log('[web3] JSON Interface:');
      console.log(contract);
      return contract;
    }
  }
  return undefined;
};

/*
Example of a contract default:
*/

const _getMembership = (address, values) => {
  let membershipType = '';
  _.filter(values, (num, key) => {
    if (num === address) {
      switch (key) {
        case 'delegateKey':
          membershipType = 'DELEGATE';
          break;
        case 'memberAddress':
          membershipType = 'MEMBER';
          break;
        case 'applicant':
          membershipType = 'APPLICANT';
          break;
        default:
          membershipType = 'ADDRESS';
          break;
      }
      return true;
    }
    return false;
  });
  return membershipType;
};

/**
* @summary from a log event on chain persists it into a contract database record
* @param {object} log with event descriptions from the blockchain
* @param {object} map with info how to write these eventos on the blockchain
* @param {string} collectiveId this is being subscribed to
*/
const _mirrorContract = (log, map, collectiveId) => {
  console.log(`[web3] Mirroring blockchain event as contract action...`);

  // final version and map guide
  const finalContract = template;
  const mapContract = map.contract;

  // create users required for this contract
  let settings;
  const addresses = _.uniq(_.filter(log.returnValues, (num) => { if (typeof num === 'string') { return web3.utils.isAddress(num); } return false; }));
  for (let i = 0; i < addresses.length; i += 1) {
    settings = {
      profile: {
        membership: _getMembership(addresses[i], log.returnValues),
        collectives: [collectiveId],
      },
    };
    migrateAddress(addresses[i], settings);
  }

  console.log(`[web3] This event has these addressess...`);
  console.log(addresses);

  /*
  let signature;
  for (let i = 0; i < mapContract.signatures.length; i += 1) {
    signature = mapContract.signatures[i];

    */
   // signature._id = parseMapCode(mapContract.signatures[i]._id); }
};

/**
* @summary writes the event log found on the blockchain to database objects according to mapping structure
* @param {object} log with event descriptions from the blockchain
* @param {object} smartContract with info how to write these eventos on the blockchain
*/
const _writeEvents = (log, smartContract) => {
  console.log('[web3] Writing events found on the blockchain to local database...');
  const map = smartContract.map;

  for (let i = 0; i < log.length; i += 1) {
    for (let k = 0; k < map.length; k += 1) {
      if (map[k].eventName === log[i].event) {
        console.log(log[i].event);
        console.log(`[web3] Adding a new ${map[k].collectionType}`);
        if (map[k].eventName === log[i].event) {
          switch (map[k].collectionType) {
            case 'Transaction':
              break;
            case 'Contract':
                if (log[i].event === 'SubmitProposal') {
                  _mirrorContract(log[i], map[k], smartContract._id);
                }
            default:
              // console.log(log[i]);
              break;
          }
        }
      }
    }
  }
};

const _updateWallet = async (publicAddress, token) => {
  if (_web3()) {
    const coin = getCoin(token);
    console.log(`contractAddress: ${coin.contractAddress}`);
    console.log(`publicAddress: ${publicAddress}`);

    const contract = new web3.eth.Contract(standardABI, coin.contractAddress);
    contract.methods.balanceOf(publicAddress).call({ name: publicAddress }, (error, balance) => {
      console.log('INSIDE BALANCE OF');
      console.log(balance);
      contract.methods.decimals().call((error, decimals) => {
        balance = balance.div(10 ** decimals);
        console.log(balance.toString());
      });
    })
  }
};

/**
* @summary show all the transactions for a given public address
* @param {object} smartContract object from a collective
*/
const _getEvents = async (smartContract) => {
  let eventLog;

  if (_web3()) {
    console.log(`[web3] Getting past events for ${smartContract.publicAddress}...`);
    const abi = JSON.parse(smartContract.abi);

    if (abi) {
      await new web3.eth.Contract(abi, smartContract.publicAddress).getPastEvents('allEvents', {
        fromBlock: START_BLOCK,
        toBlock: 'latest',
      }, (error, log) => {
        if (error) {
          console.log('[web3] Error fetching log data.');
          console.log(error);
        } else {
          console.log(`[web3] Log for ${smartContract.publicAddress} has a length of ${log.length} events.`);
          console.log(`[web3] Events consist of: ${JSON.stringify(_.uniq(_.pluck(log, 'event')))}`);

          if (log.length > 0 && smartContract.map && smartContract.map.length > 0) {
            _writeEvents(log, smartContract);
          }
        }
        return log;
      }).then((res) => {
        eventLog = res;
        return res;
      });
    }
  }
  return eventLog;
};


if (Meteor.isServer) {
  _web3();
}

export const updateWallet = _updateWallet;
export const getEvents = _getEvents;
export const getContract = _getContract;
