# Mastery-Based Battle System Redesign Spec

Version: 1.0  
Status: implementation-ready default spec  
Authoring note: where band-specific pedagogy is still open (especially D/E), the thresholds are still exact defaults; you can edit those sections by hand later.

---

## 1. Goal

Redesign the battle system so that:

1. progression is mastery-based rather than only level-based,
2. the same mathematical idea is practiced through multiple forms,
3. practice continues automatically after unlock until fluency and later mastery,
4. the game remains simple for children and does not require them to manage their own training plan,
5. every state transition is driven by exact thresholds.

This spec assumes the current core loop remains:

- battle presents a problem,
- player chooses 1 of 4 answers,
- wrong answer triggers explanation animation - as in exam, needs to be implemented in arena and battles,
- after enough practice the player can take a 10-item exam,
- exam result determines progression.

---

## 2. Core hierarchy

### 2.1 Bands (high-level atoms)

These are the major mastery ranges.

- **A** = 0-5
- **B** = 0-8
- **C** = 0-10
- **D** = 0-20 without crossing 10
- **E** = 0-20 crossing 10

Each band has its own state:

- `Locked`
- `Training`
- `Secure`
- `Fluent`
- `Mastery`

### 2.2 Sub-atoms inside each band

Each band contains four sub-atoms.

- **1** = Addition focus
- **2** = Subtraction focus
- **3** = Three-operand / multi-step focus
- **4** = Mixed integration

Examples:

- `A1` = Addition focus in range 0-5
- `C3` = Three-operand / multi-step in range 0-10
- `E4` = Mixed integration in range 0-20 crossing 10

Each sub-atom also has its own state:

- `Locked`
- `Training`
- `Secure`
- `Fluent`
- `Mastery`

### 2.3 Problem forms

Problem forms are **not** top-level atoms. They are variants used inside a sub-atom.

Supported forms:

- `result_unknown`
- `missing_part`
- `compare_equation_vs_number`
- `compare_equation_vs_equation`
- `visual_objects` - these are for hints and explanatory animations
- `bridge_or_numberline` - used in puzzles, not problems
- `target_number` - used in puzzles, not problems
- `decomposition` - special usecase - for arena new fight unlock, to be defined later

Rule: every sub-atom has a **main mathematical focus**, but multiple forms are mixed inside it.

---

## 3. State model

## 3.1 Sub-atom states

### Locked
Not available.

### Training
Available in fights. Player is collecting successful solves and working toward the exam.

### Secure
Player has basic reliable command. Next sub-atom unlocks. This sub-atom remains in rotation.

### Fluent
Player is both accurate and fast enough. This sub-atom remains in rotation less often.

### Mastery
Player has retained the sub-atom over time and across multiple forms.

## 3.2 Band states

### Locked
Previous band is not yet `Secure`.

### Training
At least one sub-atom in this band is unlocked and the band gate has not yet been passed at Bronze or better.

### Secure
All four sub-atoms are at least `Secure`, and the band gate exam is passed at Bronze or better.
This unlocks the next band.

### Fluent
Band gate exam is Silver or Gold, all sub-atoms are at least `Secure`, and at least four sub-atoms are `Fluent`.

### Mastery
Band gate exam is Gold, all four sub-atoms are `Fluent`, at least three sub-atoms are `Mastery`, and delayed mixed retention is passed.

---

## 4. Exact definitions used by the system

### 4.1 Successful solve
A **successful solve** is:

- correct on the first answer selection,
- within the 15-second item limit,
- in battles on lower levels can be assisted by hint.

Only successful solves count toward:

- the `20 successful solves` needed to unlock the sub-atom exam,
- rolling speed thresholds,
- rolling accuracy thresholds.
(current rolling speed and accuracy is kept for each sub-atom and atom as a whole, all solved problems are collected for each character with index of sequence, date-time, correct/wrong mark and solve time)

### 4.3 Accuracy windows

- `last_20_accuracy` = accuracy on the last 20 first-attempt problems in that sub-atom.
- `last_10_form_accuracy` = accuracy on the last 10 first-attempt problems of a specific form in that sub-atom.

### 4.4 Median response time
Median response time (`median_rt`) is calculated:

- using **correct first-attempt responses only**,
- excluding wrong responses and timeouts,
- on the current evaluation window (exam or rolling last 20, depending on rule),
- both exam problems and battle/special problems are counted in

Timeouts still count against the medal threshold, but are not included in the median calculation.

---

## 5. Timing system and speed tracking

Speed is tracked by the system, but it is **not used to determine Bronze / Silver / Gold exam medals**.

Speed is used only for:

1. promotion to `Fluent`,
2. promotion to `Mastery`,
3. unlocking `Mastery Challenge` availability,
4. visible in-battle bonus damage for extra-fast answers.

### 5.1 Timing thresholds

| Module type | Fluent RT | Mastery RT |
|---|---:|---:|
| **All standard modules** | 7.0 s | 5.0 s |
| **Dedicated fact drill only** | 3.0 s | 2.0 s | - may be introduced later

### 5.2 Module mapping

All sub-atoms use `All other modules`.

If a separate fact-fluency micro-drill is added later, use `Dedicated fact drill only` for that drill only.

### 5.3 What response time is tracked

For every sub-atom, track:

- `median_rt_last20_correct`
- `exam_median_rt_best`
- `form_median_rt_last10_correct` for each problem form

Median RT is always calculated from:

- **correct first-attempt answers only**
- excluding wrong answers
- excluding timeouts in exams
- excluding answer time over 20s in battle as this could be a pause etc. this answer is counted as correct (even if time to answer is very long) but response time is not calculated

Timeouts still count as incorrect for correctness-based evaluation in exams, but do not enter median RT.

Formula: Correct first-attmpt answer time / Correct first-attmpt answer count

### 5.4 Speed data sources

Speed is tracked in:

- regular battles,
- sub-atom exams,
- fluency checks,
- mastery challenges,
- band retention probes.

Speed affects hidden mastery state, but does no affect exam medals.

### 5.5 Fast-answer bonus damage

A correct first-attempt answer can grant visible bonus damage if it is answered at or below the `Mastery RT` threshold for that sub-atom, it is +1 bonus damage for each problem answered under threshold, this should be highly visible animation and should appear next to the result.

#### Exact rule

If:

- answer is correct,
- answer is first-attempt correct,
- `response_time <= Mastery RT`

then apply:

- `bonus_damage = +1`
- visible effect label = `Swift Hit`

If additionally:

- `response_time <= ~0.60 * Mastery RT`

then apply:

- `bonus_damage_multiplier = 2`
- visible effect label = `Lightning Hit` it applies as a white lightning that hits the target from the top at the time of player hitting it. (similar effect as is used for bodlina_2 lightning attack)

### 5.6 Bonus damage by module type

| Module type | Swift Hit threshold | Lightning Hit threshold |
|---|---:|---:|
| **All modules** | <= 5.0 s | <= 3 s |
| **Dedicated fact drill only** | <= 2.0 s | <= 1.3 s | - may be introduced later

### 5.7 Speed never blocks passage

Speed must never block:

- exam Bronze / Silver / Gold,
- next sub-atom unlock,
- next band unlock.

Speed only affects:

- progression from `Secure -> Fluent`,
- progression from `Fluent -> Mastery`,
- fast-answer combat bonuses.

---

## 6. Exact medal thresholds for a 10-item sub-atom exam

Every sub-atom exam has:

- `10 items`
- `15 seconds per item`
- visible result: `Fail / Bronze / Silver / Gold`

### 6.1 Medal rules

- **Gold** = `correct >= 9/10`
- **Silver** = `correct = 8/10`
- **Bronze** = `correct = 6/10`
- **Fail** = `correct <= 5/10`

No median RT threshold is used for medals.

### 6.2 Medal gameplay rewards

Visible medal rewards affect battle power for the newly cleared level.

- **Bronze**
  - reward: `+HP`
- **Silver**
  - reward: `+HP`
  - reward: `+Attack`
- **Gold**
  - reward: `+HP`
  - reward: `+Attack`
  - reward: `+2 Mana bonus`

Exact numeric values are balancing parameters and may be set later. The medal meaning itself is fixed, this is already implemented.

### 6.3 Medal -> progression mapping

- `Fail` -> sub-atom remains `Training`
- `Bronze` -> sub-atom becomes at least `Secure`
- `Silver` -> sub-atom becomes at least `Secure`
- `Gold` -> sub-atom becomes at least `Fluent`

Exam medal does **not** directly determine `Fluent` or `Mastery`.

It only determines:

- visible level success,
- reward quality,
- whether the child passed the unlock gate.

---

## 7. Exact sub-atom state transitions

## 7.1 Locked -> Training

A sub-atom becomes `Training` when:

- it is `1` in a newly unlocked band, or
- the previous sub-atom in the same band becomes at least `Secure`.

Exact unlock chain inside a band:

- `1` unlocks when band unlocks,
- `2` unlocks when `1` is `Secure` or better,
- `3` unlocks when `2` is `Secure` or better,
- `4` unlocks when `3` is `Secure` or better.

## 7.2 Training -> exam unlocked

A sub-atom exam becomes available when all of the following are true:

- `successful_solves >= 20`
- `last_20_accuracy >= 70%`
- at least `2 problem forms` inside that sub-atom have `>= 4 successful solves each`

## 7.3 Training -> Secure

A sub-atom becomes `Secure` when all of the following are true:

- current state = `Training`
- sub-atom exam has been passed at `Bronze` or better

Exam medal quality does not matter for `Secure`; any passing medal is sufficient.

## 7.4 Training after failed exam

If the player fails the exam:

- sub-atom stays `Training`
- next exam attempt is unlocked immediately

## 7.5 Secure -> Fluent

A sub-atom becomes `Fluent` through mastery logic or by attaining gold medal in exam.

All of the following are required:

- current state = `Secure`
- `successful_solves >= 30`
- `last_20_accuracy >= 85%`
- `median_rt_last20_correct <= Fluent RT`
- at least `2 distinct problem forms` have:
  - `last_10_form_accuracy >= 80%`

No exam medal is required for `Fluent`. If `Fluent` threshold is reached after bronze or silver medal, Fluency challenge is unlocked, that will award fluency on pass.

### Fluency Challenge rules

Each sub-atom Fluency challenge has:

- `12 items`
- `15 seconds per item`
- mixed across all problem forms

Pass condition:

- `correct >= 10/12`

Speed is tracked, but does not determine challenge pass/fail.
However, the challenge should still record RT for analytics.

---

## 7.7 Fluent -> Mastery challenge available

A sub-atom becomes eligible for a visible `Mastery Challenge` when all of the following are true:

- current state = `Fluent`
- `successful_solves >= 50`
- `last_20_accuracy >= 92%`
- `median_rt_last20_correct <= Mastery RT`
- at least `2 distinct problem forms` have:
  - `last_10_form_accuracy >= 90%`
  - `form_median_rt_last10_correct <= Mastery RT`

This does not yet grant `Mastery`.
It only unlocks the challenge.

## 7.8 Fluent -> Mastery

A sub-atom becomes `Mastery` when all of the following are true:

- `Mastery Challenge` is available
- player passes the `Mastery Challenge`

### Mastery Challenge rules

Each sub-atom mastery challenge has:

- `12 items`
- `15 seconds per item`
- mixed across all problem forms

Pass condition:

- `correct >= 11/12`

Speed is tracked, but does not determine challenge pass/fail.
However, the challenge should still record RT for analytics.

---

## 8. Exact band state transitions

## 8.1 Locked -> Training

A band becomes `Training` when:

- the previous band becomes `Secure` or better, or
- it is Band A at the start of the game.

## 8.2 Training -> Secure

A band becomes `Secure` when all of the following are true:

- all sub-atoms in the band are at least `Secure`
- the band gate exam is passed at `Bronze` or better

This unlocks the next band.

## 8.3 Secure -> Fluent

A band becomes `Fluent` when all of the following are true:

- band state is already `Secure`
- at least `3 of 4` sub-atoms are `Fluent` or better

Band gate gold medal does can grant `Fluent` directly, given that

- `median_rt_last20_correct <= Fluent RT`
- at least `3 of 4` sub-atoms are `Fluent` or better

## 8.4 Fluent -> Mastery challenge available

A band becomes eligible for a visible `Band Mastery Challenge` when all of the following are true:

- band state = `Fluent`
- all `4 of 4` sub-atoms are `Fluent` or better
- at least `3 of 4` sub-atoms are already `Mastery`

### Band Fluency Challenge - tb defined later

## 8.5 Fluent -> Mastery

A band becomes `Mastery` when all of the following are true:

- `Band Mastery Challenge` is available
- player passes the `Band Mastery Challenge`

### Band Mastery Challenge rules

Each band mastery challenge has:

- `20 items`
- `15 seconds per item`
- mixed across all four sub-atoms
- includes at least:
  - `4` addition-family items
  - `4` subtraction-family items
  - `4` comparison-family items
  - `6` three-operand / multi-step items

Pass condition:

- `correct >= 18/20`

Speed is tracked, but does not determine pass/fail.

---

## 9. Exact band gate exam spec

Each band gate exam has:

- `16 items`
- `15 seconds per item`
- visible result: `Fail / Bronze / Silver / Gold`

### 9.1 Item composition

- `4` items from Addition focus
- `4` items from Subtraction focus
- `4` items from Comparison / relation focus
- `4` items from Three-operand / multi-step focus

### 9.2 Gate medal rules

- **Gold** = `correct >= 15/16`
- **Silver** = `correct = 13/16 or 14/16`
- **Bronze** = `correct = 11/16 or 12/16`
- **Fail** = `correct <= 11/16`

No median RT threshold is used for gate medals.

### 9.3 Gate medal gameplay rewards - tb defined exactly, also shards perhaps

- **Bronze gate**
  - unlock next band
  - grant band-clear HP reward
- **Silver gate**
  - unlock next band
  - grant band-clear HP reward
  - grant band-clear Attack reward
- **Gold gate**
  - unlock next band
  - grant band-clear HP reward
  - grant band-clear Attack reward
  - grant band-clear Mana reward

### 9.4 Gate medal -> band meaning

- Bronze or silver = band becomes `Secure` 
- Gold may grant `Fluent` if sub-atom conditions are met (8.3)
- medal quality does not determine `Mastery`

---

## 10. Exact problem-form weights inside sub-atoms

The same sub-atom changes its internal form mix over time.

### Phase definitions

- **Phase T1** = first `0-9` successful solves in the sub-atom
- **Phase T2** = successful solves `10-19`
- **Phase S** = state `Secure`
- **Phase F/M** = state `Fluent` or `Mastery`

## 10.1 Sub-atom problem-form composition

| Phase | Result unknown addition | Missing part | Compare equation vs number | Compare equation vs equation |
|---|---:|---:|---:|---:|
| **T1** | 50% | 20% | 30% | 0% |
| **T2** | 40% | 30% | 20% | 10% |
| **S** | 30% | 30% | 25% | 15% |
| **F/M** | 25% | 25% | 25% | 25% |

## 10.2 problem-form definition

- Result unknown addition = `X [+ or -] Y = ?`
- Missing part  = `? [+ or -] Y = Z` or `X [+ or -] ? = ?`
- Compare equation vs number = `X [+ or -] Y ? Z` (fill >/</=)
- Compare equation vs equation = `X [+ or -] Y ? Z [+ or -] W` (fill >/</=)

+ and - is determined by the sub-atom

- 1 = + only
- 2 = - only
- 3 = mixed
- 4 = mixed

## 11. Exact 10-item exam composition for all sub-atoms

## 11.1 All sub-atom exams

- 3 result-unknown
- 3 missing-part
- 2 Compare equation vs nuber
- 2 Compare equation vs equation

## 12. Exact fight scheduler

## 12.1 Current training target

At any time, define:

- `current_band` = highest unlocked band that is not yet `Secure`; if all unlocked bands are Secure, use the highest unlocked band that is not yet `Mastery`
- `frontier_subatom` = lowest-numbered sub-atom in `current_band` whose state is `Training`; at the beginning of the game sub-atom A1 is in training

## 12.3 Default mode

Default mode is **Adventure**.

The player may optionally choose another mode, but if they do not choose, use Adventure automatically. Other modes and usage: TB defined

## 12.4 Battle problem selection

Create a pool of 10 problems in this way, start from the top:

- [retry] use 3 problem that have been answered incorrectly in the last pool or exam
- [slow] use 3 problems that have timed out or were answered in time > 15s in the last pool or in exam
- [current] `6` problems from `frontier_subatom` (max one of them can include 0 anywhere, use 2 problems with highest average response time, different problems than have been used in the last pool, remainig 4 to be randomly selected from the rest of the problems in each group)
- [improve] `2` problems from same-band sub-atoms that are `Secure` but not `Fluent`
- [review] `1` problem from review pool (`Fluent` due for review)
- [master] `1` from this category pool (`Mastery` due for review)

Every time a problem is answered incorrectly, it falls into [retry] category, stays there until solved correctly.

Every time a problem resolution time is over 15s it falls into [slow] category, stays until resolved under 15s.

If a category is empty, continue with the next in line, loop if necessary.
All possible problems for each category must be entered in a database so that all possible problems are known upfront.

Example: 

At the beginning, all categories besides [current] are empty, so loop takes 6 from current, randomly but max 1 contains 0, than loops and selects another 4 from current.

## 12.7 Mastery mode visibility

A `Mastery Challenge` button becomes visible to the child only when:

- at least one sub-atom has reached `Fluent`, and
- that specific sub-atom or band has satisfied challenge-availability conditions.

Before that point, mastery structure is hidden from the child. - this will be a new screen defined later.

---

## 13. Exact review recurrence rules

## 13.1 Secure-but-not-Fluent review rule

Problems from a `Secure` sub-atom that is not yet `Fluent` are added into the [improve] category, they are ordered by the average RT, on top are problems never encountered, under it the highest RT problems, when items from more sub-atoms are in the category they are always alternating (A1, A2, A3, A1, A2, A3). Solved problems go to the end of the line. 

## 13.2 Fluent review rule

Problems from a `Fluent` sub-atoms are added to the [review] category under the same rules as the [improve] category.

## 13.3 Mastery review rule

Problems from a `Mastery` sub-atoms are added to the [master] category pool under the same conditions and rules as above.

## 14. Exact progression flow across a band

For each band (A, B, C, D, E), the intended flow is:

1. `1` starts in `Training`
2. player reaches exam unlock threshold
3. exam gives Fail / Bronze / Silver / Gold
4. Bronze or better makes sub-atom `Secure` or `Fluent`
5. next sub-atom unlocks once the previous sub-atom is at least `Secure`
6. earlier sub-atoms continue in automatic rotation until later upgraded to `Fluent`
7. once `Fluent`, a sub-atom can work toward `Mastery Challenge` availability
8. once `4` is at least `Secure`, band gate exam becomes available
9. Bronze or better on gate makes band `Secure` or `Fluent` and unlocks next band
10. later hidden state logic promotes the band to `Fluent`
11. finally the band can unlock and pass a `Band Mastery Challenge`

---

## 15. Exact rules for next-band unlock

- Band B unlocks when Band A becomes `Secure`
- Band C unlocks when Band B becomes `Secure`
- Band D unlocks when Band C becomes `Secure`
- Band E unlocks when Band D becomes `Secure`

When a new band unlocks:

- new band state = `Training`
- new band sub-atom `1` state = `Training`
- all other sub-atoms in the new band = `Locked`

Earlier bands remain active in review according to the recurrence rules.

---

## 16. Recommended UI surface

## 16.1 Parent / teacher view

Parents and teachers can always see the full mastery-node map, including:

- all bands,
- all sub-atoms,
- visible state of every node:
  - Locked
  - Training
  - Secure
  - Fluent
  - Mastery
- mastery-challenge availability

## 16.2 Child view before fluency

Before the child has reached `Fluent` in at least one sub-atom, show only:

- current band,
- current sub-atoms,
- visible medals,
- visible rewards,
- visible progression to next exam / gate.
- possibility of retaking exam if gold has not been acquired.

Do not show the mastery map yet.

## 16.3 Child view after first fluency

After the child reaches `Fluent` in at least one sub-atom, the child view may reveal:

- simplified mastery map,
- only already encountered nodes,
- mastery challenges when available.

The full parent/teacher analytics view remains richer than the child view.

---

## 17. Rewards

### 17.1 Mana gathering:

Keep the existing mechanic, mana meditation to become available - will allow practice of the problems that are close to reaching mana award - to be defined later.

### 17.2 Fast-answer combat bonuses

Apply only on first-attempt correct answers.

- `Swift Hit`:
  - if `response_time <= Mastery RT`
  - damage multiplier = `+1`
- `Lightning Hit`:
  - if `response_time <= ~0.60 * Mastery RT`
  - damage multiplier = `+2`

### 17.3 Exam medal rewards

- **Bronze**
  - grant HP reward
- **Silver**
  - grant HP reward
  - grant Attack reward
- **Gold**
  - grant HP reward
  - grant Attack reward
  - grant Mana reward

### 17.4 Gate rewards

- **Bronze gate**
  - unlock next band
  - HP reward
- **Silver gate**
  - unlock next band
  - HP reward
  - Attack reward
- **Gold gate**
  - unlock next band
  - HP reward
  - Attack reward
  - Mana reward

### 17.5 Mastery challenge rewards - Crystal and Special crystal awards, to be defined more exactly

Recommended default:

- sub-atom mastery challenge clear:
  - mastery badge
  - crystals
  - special crystal
- band mastery challenge clear:
  - major badge / trophy
  - visible world completion mark
  - major crystal

---



+++++ OLD Version - do not read +++++

## 5. Timing classes (preserved from the earlier design round)

These are the exact default timing classes to use.

For All modules A-E:
Comparison modules (A3, B3, C3, D3, E3) use 6 / 4 / 3 / 3
All other modules use 10 / 7 / 5 / 3



### 5.1 Default timing-class mapping by sub-atom

Use this mapping unless hand-edited later.

| Sub-atom type | Bands A-C | Bands D-E |
|---|---|---|
| **1 Addition focus** | Concept / modeling | Strategy / flexible computation |
| **2 Subtraction focus** | Concept / modeling | Strategy / flexible computation |
| **3 Comparison / relation focus** | Recognition / comparison | Recognition / comparison |
| **4 Three-operand / multi-step focus** | Concept / modeling | Strategy / flexible computation |
| **5 Mixed integration** | Concept / modeling | Strategy / flexible computation |

### 5.2 Optional override for within-10 fact drills

If later you create a dedicated **fact fluency micro-drill** inside Band C, use the `Fact retrieval / automaticity` timing class for that micro-drill only. Do **not** change the default C-band sub-atom timing classes unless you want a more aggressive fluency target.

---

## 6. Exact medal thresholds for a 10-item sub-atom exam

Every sub-atom exam has:

- `10 items`
- `15 seconds per item`
- `1 medal result`: Fail / Bronze / Silver / Gold

### 6.1 Medal rules

For the correct timing class assigned to that sub-atom:

- **Gold** = `correct >= 9/10` AND `median_rt <= Gold RT` AND `timeouts = 0`
- **Silver** = `correct >= 8/10` AND `median_rt <= Silver RT` AND `timeouts <= 1`
- **Bronze** = `correct >= 7/10` AND `median_rt <= Bronze RT` AND `timeouts <= 2`
- **Fail** = anything else

### 6.2 Medal -> state mapping at exam time

- `Fail` -> sub-atom remains `Training`
- `Bronze` -> sub-atom becomes `Secure`
- `Silver` or `Gold` -> sub-atom becomes `Fluent`

This preserves the intended meaning:

- Bronze = ready to move on,
- Silver/Gold = ready and fast enough,
- Fail = not ready yet.

---

## 7. Exact sub-atom state transitions

## 7.1 Locked -> Training

A sub-atom becomes `Training` when:

- it is `1` in a newly unlocked band, or
- the previous sub-atom in the same band becomes at least `Secure`.

Exact unlock chain inside a band:

- `1` unlocks when band unlocks,
- `2` unlocks when `1` is `Secure` or better,
- `3` unlocks when `2` is `Secure` or better,
- `4` unlocks when `3` is `Secure` or better,
- `5` unlocks when `4` is `Secure` or better.

## 7.2 Training -> exam unlocked

A sub-atom exam becomes available when all of the following are true:

- `successful_solves >= 20`
- `last_20_accuracy >= 80%`
- `at least 2 problem forms` inside that sub-atom have `>= 4 successful solves each`

## 7.3 Training -> Secure or Fluent

Triggered by the 10-item exam medal:

- Bronze -> `Secure`
- Silver/Gold -> `Fluent`

## 7.4 Training after failed exam

If the player fails the exam:

- sub-atom stays `Training`
- next exam attempt is unlocked immediately

## 7.5 Secure -> Fluent

If the first exam only earned Bronze, later promotion to `Fluent` requires all of the following:

- current state = `Secure`
- `successful_solves >= 40`
- `last_20_accuracy >= 90%`
- rolling `median_rt <= Silver RT` for that sub-atom’s timing class
- pass a **Fluency Check** of `10 items` with at least `Silver`

Fluency Check rules are identical to the normal sub-atom exam rules.

## 7.6 Fluent -> Mastery

A sub-atom becomes `Mastery` only when all of the following are true:

- current state = `Fluent`
- `successful_solves >= 50`
- at least `2 distinct problem forms` have `last_10_form_accuracy >= 90%`
- player passes **two Mastery Probes**:
  - each probe has `10 items`
  - each probe requires `>= 9/10 correct`
  - the two probes must be separated by either:
    - `>= 24 hours`, or
    - `>= 5 fights`
  - across both probes combined:
    - `correct >= 19/20`
    - `combined_median_rt <= Mastery RT`

This is the exact implementation of retained mastery.

---

## 8. Exact band state transitions

## 8.1 Locked -> Training

A band becomes `Training` when:

- the previous band becomes `Secure` or better, or
- it is Band A at the start of the game.

## 8.2 Training -> Secure

A band becomes `Secure` when all of the following are true:

- all five sub-atoms in the band are at least `Secure`
- the band gate exam is passed at `Bronze` or better

This unlocks the next band.

## 8.3 Secure -> Fluent

A band becomes `Fluent` when all of the following are true:

- band state is already `Secure`
- at least `4 of 5` sub-atoms are `Fluent` or better
- no sub-atom is below `Secure`
- the band gate exam has been passed at `Silver` or `Gold`

## 8.4 Fluent -> Mastery

A band becomes `Mastery` when all of the following are true:

- band state is already `Fluent`
- all `5 of 5` sub-atoms are `Fluent` or better
- at least `3 of 5` sub-atoms are `Mastery`
- the band gate exam has been passed at `Gold`
- player passes **Band Retention**:
  - two mixed probes of `10 items` each
  - separated by `>= 24 hours` or `>= 10 fights`
  - each probe `>= 9/10 correct`
  - combined `>= 19/20 correct`
  - combined median response time:
    - `<= 4.0 s` for Bands A-E

---

## 9. Exact band gate exam spec

Each band gate exam has:

- `16 items`
- `15 seconds per item`
- medal result: Fail / Bronze / Silver / Gold

### 9.1 Item composition

- `4` items from Addition focus
- `4` items from Subtraction focus
- `3` items from Comparison / relation focus
- `3` items from Three-operand / multi-step focus
- `2` special transfer items from:
  - missing part,
  - decomposition,
  - visual,
  - bridge / numberline,
  - target number

### 9.2 Gate timing thresholds

Use these exact gate median RT thresholds:

| Band group | Bronze RT | Silver RT | Gold RT |
|---|---:|---:|---:|
| **Bands A-C** | 7.0 s | 5.0 s | 4.0 s |
| **Bands D-E** | 8.0 s | 5.0 s | 4.0 s |

### 9.3 Gate medal rules

- **Gold** = `correct >= 15/16` AND `median_rt <= Gold RT` AND `timeouts = 0`
- **Silver** = `correct >= 14/16` AND `median_rt <= Silver RT` AND `timeouts <= 1`
- **Bronze** = `correct >= 12/16` AND `median_rt <= Bronze RT` AND `timeouts <= 2`
- **Fail** = anything else

### 9.4 Gate medal -> band meaning

- Bronze = band becomes `Secure`
- Silver = band is eligible for `Fluent` if the sub-atom conditions are also met
- Gold = band is eligible for `Mastery` later if the sub-atom and retention conditions are also met

---

## 10. Exact problem-form weights inside each sub-atom

The same sub-atom changes its internal form mix over time.

### Phase definitions

- **Phase T1** = first `0-9` successful solves in the sub-atom
- **Phase T2** = successful solves `10-19`
- **Phase S** = state `Secure`
- **Phase F/M** = state `Fluent` or `Mastery`

## 10.1 Sub-atom 1: Addition focus

| Phase | Result unknown addition | Visual addition | Missing part | Decomposition / target | Compare relation |
|---|---:|---:|---:|---:|---:|
| **T1** | 50% | 20% | 15% | 10% | 5% |
| **T2** | 40% | 15% | 20% | 15% | 10% |
| **S** | 30% | 10% | 25% | 20% | 15% |
| **F/M** | 25% | 5% | 25% | 25% | 20% |

## 10.2 Sub-atom 2: Subtraction focus

| Phase | Result unknown subtraction | Visual / bridge-back | Missing part | Compare relation | Decomposition / regrouping |
|---|---:|---:|---:|---:|---:|
| **T1** | 50% | 20% | 15% | 10% | 5% |
| **T2** | 40% | 15% | 20% | 15% | 10% |
| **S** | 30% | 10% | 25% | 20% | 15% |
| **F/M** | 25% | 5% | 25% | 25% | 20% |

## 10.3 Sub-atom 3: Comparison / relation focus

| Phase | Equation vs number | Number vs number | Equation vs equation | Missing-part comparison | Decomposition comparison |
|---|---:|---:|---:|---:|---:|
| **T1** | 50% | 25% | 15% | 5% | 5% |
| **T2** | 35% | 20% | 25% | 10% | 10% |
| **S** | 25% | 15% | 30% | 15% | 15% |
| **F/M** | 20% | 10% | 30% | 20% | 20% |

## 10.4 Sub-atom 4: Three-operand / multi-step focus

| Phase | 3-operand result unknown | Visual / grouped | Missing term | Compare value | Decomposition / grouping |
|---|---:|---:|---:|---:|---:|
| **T1** | 55% | 15% | 10% | 10% | 10% |
| **T2** | 45% | 10% | 15% | 15% | 15% |
| **S** | 35% | 5% | 20% | 20% | 20% |
| **F/M** | 30% | 5% | 20% | 20% | 25% |

## 10.5 Sub-atom 5: Mixed integration

| Phase | Addition family | Subtraction family | Comparison family | 3-operand family | Special transfer forms |
|---|---:|---:|---:|---:|---:|
| **T1** | 25% | 25% | 20% | 15% | 15% |
| **T2** | 20% | 20% | 20% | 20% | 20% |
| **S** | 20% | 20% | 20% | 20% | 20% |
| **F/M** | 15% | 15% | 20% | 20% | 30% |

### 10.6 Meaning of “Special transfer forms” in Sub-atom 5

The `Special transfer forms` bucket is split exactly as:

- 30% missing part
- 30% decomposition
- 20% visual
- 10% bridge / numberline
- 10% target number

For Bands D and E:

- in **D**, `bridge / numberline` means teen-number movement without crossing 10,
- in **E**, `bridge / numberline` means crossing 10 explicitly.

---

## 11. Exact 10-item exam composition by sub-atom

## 11.1 Addition focus exam

- 4 addition result-unknown
- 2 missing-part addition
- 2 decomposition / target-number addition
- 1 visual addition
- 1 compare-relation item involving an addition expression

## 11.2 Subtraction focus exam

- 4 subtraction result-unknown
- 2 missing-part subtraction
- 2 compare-relation subtraction items
- 1 visual / bridge-back subtraction item
- 1 decomposition / regrouping item

## 11.3 Comparison focus exam

- 4 equation-vs-number
- 3 equation-vs-equation
- 2 missing-part or decomposition comparison items
- 1 visual comparison item

## 11.4 Three-operand / multi-step exam

- 5 three-operand result-unknown
- 2 missing-term items
- 2 compare-value or grouping items
- 1 visual / grouped item

## 11.5 Mixed integration exam

- 2 addition-family items
- 2 subtraction-family items
- 2 comparison-family items
- 2 three-operand items
- 2 special transfer items

---

## 12. Exact fight scheduler

## 12.1 Fight length

Default battle fight length:

- `10 problems per fight`

This spec assumes every fight uses exactly 10 problems.

## 12.2 Current training target

At any time, define:

- `current_band` = highest unlocked band that is not yet `Secure`; if all unlocked bands are Secure, use the highest unlocked band that is not yet `Mastery`
- `frontier_subatom` = lowest-numbered sub-atom in `current_band` whose state is `Training`; if none exist and gate not yet passed, the system switches to gate-prep behavior

## 12.3 Default mode

Default mode is **Adventure**.

The player may optionally choose another mode, but if they do not choose, use Adventure automatically.

## 12.4 Adventure mode fight composition

Use exactly:

- `6` problems from `frontier_subatom`
- `3` problems from same-band sub-atoms that are `Secure` but not `Fluent`
- `1` problem from review pool (`Fluent` or `Mastery`, due for review)

If a pool is empty, backfill in this order:

1. same-band `Secure` but not `Fluent`
2. `frontier_subatom`
3. review pool

## 12.5 Training mode fight composition

Use exactly:

- `8` problems from `frontier_subatom`
- `1` problem from same-band `Secure` but not `Fluent`
- `1` problem from review pool

## 12.6 Boss Prep mode fight composition

Use exactly:

- `4` problems from `frontier_subatom` or gate-target pool
- `4` problems from weaker same-band sub-atoms (`Training` or `Secure` but not `Fluent`)
- `2` problems from mixed review inside the same band

Boss Prep becomes visible when either:

- a sub-atom exam is unlocked, or
- the band gate exam is unlocked.

## 12.7 Automatic gate-prep behavior

If all five sub-atoms in the current band are at least `Secure` but the band gate exam is not yet passed, the default mode automatically switches from Adventure to Boss Prep.

---

## 13. Exact review recurrence rules

## 13.1 Secure-but-not-Fluent review rule

A `Secure` sub-atom that is not yet `Fluent` must appear at least once every **3 fights**.

Operational rule:

- if a `Secure` sub-atom is absent for `2 consecutive fights`, force `2 items` from that sub-atom into the next fight.

## 13.2 Fluent review rule

A `Fluent` sub-atom must appear at least once every **8 fights**.

Operational rule:

- if a `Fluent` sub-atom is absent for `7 consecutive fights`, force `1 item` from that sub-atom into the next fight.

## 13.3 Mastery review rule

A `Mastery` sub-atom must appear at least once every **15 fights**.

Operational rule:

- if a `Mastery` sub-atom is absent for `14 consecutive fights`, force `1 item` from that sub-atom into the next fight.

## 13.4 Forced review priority order

If multiple sub-atoms are due at once, pull them in this order:

1. same-band `Secure` but not `Fluent`
2. same-band `Fluent`
3. earlier-band `Secure` but not `Fluent`
4. earlier-band `Fluent`
5. any `Mastery`

---

## 14. Exact progression flow across a band

For each band (A, B, C, D, E), the intended flow is:

1. `1` starts in `Training`
2. player reaches exam unlock threshold
3. exam gives Fail / Bronze / Silver / Gold
4. Bronze makes sub-atom `Secure`, Silver/Gold makes it `Fluent`
5. next sub-atom unlocks once the previous sub-atom is at least `Secure`
6. earlier sub-atoms continue in automatic rotation until later upgraded to `Fluent` and eventually `Mastery`
7. once `5` is at least `Secure`, band gate exam becomes available
8. Bronze on gate makes band `Secure` and unlocks next band
9. Silver/Gold on gate plus sub-atom conditions later promote the band to `Fluent` or `Mastery`

---

## 15. Exact rules for next-band unlock

- Band B unlocks when Band A becomes `Secure`
- Band C unlocks when Band B becomes `Secure`
- Band D unlocks when Band C becomes `Secure`
- Band E unlocks when Band D becomes `Secure`

When a new band unlocks:

- new band state = `Training`
- new band sub-atom `1` state = `Training`
- all other sub-atoms in the new band = `Locked`

Earlier bands remain active in review according to the recurrence rules.

---

## 16. Recommended UI surface (exactly what to show)

## 16.1 Sub-atom display

Show every sub-atom with one of these states:

- Locked
- Training
- Secure
- Fluent
- Mastery

Example:

- A1 Fluent
- A2 Secure
- A3 Training
- A4 Locked
- A5 Locked

## 16.2 Band display

Show every band with one of these states:

- Locked
- Training
- Secure
- Fluent
- Mastery

Example:

- Band A Secure
- Band B Training

This is the recommended visible progression model. No extra hidden “meta level” is needed beyond these states.

---

## 17. Rewards (recommended default; optional)

These rewards are optional but fit the system cleanly.

### 17.1 In-fight streak mana

Keep the existing mechanic:

- 3 in a row = small mana reward
- 5 in a row = medium mana reward
- 10 in a row = large mana reward

### 17.2 Exam rewards

- Bronze = 1 mastery star
- Silver = 2 mastery stars
- Gold = 3 mastery stars

### 17.3 Gate rewards

- Bronze gate = unlock next band
- Silver gate = unlock next band + cosmetic / badge reward
- Gold gate = unlock next band + premium badge / prestige reward

---

## 18. Suggested data model

```json
{
  "bandId": "A",
  "bandState": "Training",
  "subAtoms": {
    "A1": {
      "state": "Secure",
      "successfulSolves": 32,
      "attempts": 41,
      "last20Accuracy": 0.9,
      "rollingMedianRt": 5.8,
      "examBestMedal": "Bronze",
      "fluencyCheckBestMedal": null,
      "masteryProbe1": null,
      "masteryProbe2": null,
      "fightsSinceSeen": 1,
      "formStats": {
        "result_unknown": {"last10Accuracy": 0.9},
        "missing_part": {"last10Accuracy": 0.8},
        "decomposition": {"last10Accuracy": 0.9}
      }
    }
  }
}