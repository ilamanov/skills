---
name: probe
description: Before you implement a complex change, write its main architecture as code stubs and agree on them with the user.
---

# Probe

## Goal

Agree with the user on the structure of a complex change before you implement it. Some decisions control all the other work, for example the schema, the API, the interfaces, and the module boundaries. If one of these decisions is wrong, much work must be done again. It is cheaper to agree on them first.

## Steps

1. **Find the decisions that control the change.** Only these decisions go into the skeleton.
2. **Write the stubs in real code.** Put the files in their real locations. Use real types and signatures. Leave the bodies empty. Do not write logic or tests. Do not commit.
3. **Show the skeleton to the user.** Give each decision in one line with the reason. If a decision was difficult, tell the alternative.
4. **Change the stubs until the user agrees.** Do not add scope.

## Rules

- If the change is simple, tell the user that a probe is not necessary.
- When the user agrees, stop. Do not implement the change.
