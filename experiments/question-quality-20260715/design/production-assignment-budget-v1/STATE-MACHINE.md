# Assignment budget state machine

```text
UNENROLLED
   | create immutable policy row before provider work
   v
ACTIVE ----------------------------------------------------+
   | pre-send atomic call + worst-case-cost reservation    |
   |                                                       |
   +-- both capacities available --> LEASED(n) --> SEND ---+
   |                                         |              |
   |                                         +--> HTTP_RESPONSE
   |                                         +--> NETWORK_ERROR
   |                                         +--> AMBIGUOUS (crash; remains consumed)
   |
   +-- either capacity unavailable --> EXHAUSTED (typed, no send)

ACTIVE/EXHAUSTED --> CLOSED when the Workbench job reaches a terminal state
```

Invariants:

- `leasedCalls` never decreases.
- every send has a committed worst-case cost reservation.
- unknown or ambiguous outcomes retain the full reservation.
- `(jobId, ordinal)` is unique.
- `ordinal <= maxPhysicalCalls` in every enforcing policy.
- only a committed ordinal may reach the native fetch delegate.
- an observation transition never authorizes a new send.
- reopening the same job after a Trigger retry preserves all ordinals.
- raising a cap requires a new explicit policy version and is forbidden for an
  already-started job.
- research-campaign and production-assignment scopes are mutually exclusive.
