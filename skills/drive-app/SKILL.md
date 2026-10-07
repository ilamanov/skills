---
name: drive-app
description: Use an app as a real user does, and keep a guide at the root of the repository that tells agents how to use it.
---

# Drive the app

## Goal

Give agents a reliable way to use the app as a user. Then they can prove changes without help from the user.

## Steps

1. **Read the guide.** The guide is `HOW-TO-USE-THE-PRODUCT.md` at the root of the repository. If it does not exist, learn the app and create the guide.
2. **Learn what the guide does not tell.** Do each main flow one time, as a user does.
3. **Use the app.** Follow the guide.
4. **Update the guide.** When you learn something new, or when a step in the guide is wrong, change the guide.

## The guide

Use these sections:

1. **Start the app.** How to start it locally, and the URLs of preview and production.
2. **Sign in.** How to sign in in each environment.
3. **Test accounts and data.** How to make test accounts and test data.
4. **Test payments.** How to use the test mode of the payment provider.
5. **Main flows.** The steps for each main flow.
6. **Problems and solutions.** Problems that agents found, and how to solve them.

## Rules

- Do not use real payments. Use the test mode of the payment provider.
- Do not create test accounts in production, unless the user approves it.
- Do not save secrets in the guide.
