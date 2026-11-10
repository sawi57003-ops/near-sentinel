//! Sentinel Verdict Registry — NEAR integration of Sentinel (Base).
//! Stores AI audit verdicts on-chain (token, score 0-100, PASS/FAIL, timestamp)
//! plus a spending-limit policy (max per swap, in USD cents) that the agent
//! enforces before it ever asks 1Click Intents for a quote.
//! Deployed to NEAR testnet by the Sentinel agent loop.

use near_sdk::{near, store::UnorderedMap, AccountId, PanicOnDefault};

#[derive(Clone)]
#[near(serializers = [json, borsh])]
pub struct Verdict {
    pub token: String,
    pub score: u8,
    pub passed: bool,
    pub timestamp: u64,
    pub reasons: Vec<String>,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct VerdictRegistry {
    pub owner: AccountId,
    pub verdicts: UnorderedMap<String, Verdict>,
    /// max swap size in USD cents (policy cap, e.g. 10000 = $100)
    pub max_swap_usd_cents: u128,
}

#[near]
impl VerdictRegistry {
    #[init]
    pub fn new(owner: AccountId, max_swap_usd_cents: u128) -> Self {
        Self { owner, verdicts: UnorderedMap::new(b"v"), max_swap_usd_cents }
    }

    /// Publish (or update) an AI audit verdict. Owner (the Sentinel agent) only.
    pub fn publish_verdict(&mut self, token: String, score: u8, passed: bool, reasons: Vec<String>) {
        assert_eq!(near_sdk::env::predecessor_account_id(), self.owner, "only owner");
        assert!(score <= 100, "score must be 0-100");
        self.verdicts.insert(token.clone(), Verdict {
            token,
            score,
            passed,
            timestamp: near_sdk::env::block_timestamp_ms() / 1000,
            reasons,
        });
    }

    /// Update the spending-limit policy. Owner only.
    pub fn set_max_swap(&mut self, max_swap_usd_cents: u128) {
        assert_eq!(near_sdk::env::predecessor_account_id(), self.owner, "only owner");
        self.max_swap_usd_cents = max_swap_usd_cents;
    }

    pub fn get_verdict(&self, token: String) -> Option<Verdict> {
        self.verdicts.get(&token).cloned()
    }

    pub fn get_all(&self) -> Vec<Verdict> {
        self.verdicts.values().cloned().collect()
    }

    pub fn get_policy(&self) -> (AccountId, u128) {
        (self.owner.clone(), self.max_swap_usd_cents)
    }
}
