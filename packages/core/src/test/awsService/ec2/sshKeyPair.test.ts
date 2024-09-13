/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import assert from 'assert'
import * as fs from 'fs-extra'
import * as sinon from 'sinon'
import * as path from 'path'
import { SshKeyPair } from '../../../awsService/ec2/sshKeyPair'
import { createTestWorkspaceFolder, installFakeClock } from '../../testUtil'
import { InstalledClock } from '@sinonjs/fake-timers'

describe('SshKeyUtility', async function () {
    let temporaryDirectory: string
    let keyPath: string
    let keyPair: SshKeyPair
    let clock: InstalledClock

    before(async function () {
        temporaryDirectory = (await createTestWorkspaceFolder()).uri.fsPath
        keyPath = path.join(temporaryDirectory, 'testKeyPair')
        clock = installFakeClock()
    })

    beforeEach(async function () {
        keyPair = await SshKeyPair.getSshKeyPair(keyPath, 30000)
    })

    afterEach(async function () {
        await keyPair.delete()
    })

    after(async function () {
        await keyPair.delete()
        clock.uninstall()
        sinon.restore()
    })

    it('generates key in target file', async function () {
        const contents = await vscode.workspace.fs.readFile(vscode.Uri.file(keyPath))
        assert.notStrictEqual(contents.length, 0)
    })

    it('sets key permission to read/write by owner', async function () {
        const fileMode = (await fs.stat(keyPath)).mode
        // Mode is in decimal, so convert to decimal with bitmask
        // source: https://github.com/nodejs/node-v0.x-archive/issues/3045
        assert.strictEqual(fileMode & 0o777, 0o600)
    })

    it('properly names the public key', function () {
        assert.strictEqual(keyPair.getPublicKeyPath(), `${keyPath}.pub`)
    })

    it('reads in public ssh key that is non-empty', async function () {
        const key = await keyPair.getPublicKey()
        assert.notStrictEqual(key.length, 0)
    })

    it('does overwrite existing keys on get call', async function () {
        const generateStub = sinon.spy(SshKeyPair, 'generateSshKeyPair')
        const keyBefore = await vscode.workspace.fs.readFile(vscode.Uri.file(keyPath))
        keyPair = await SshKeyPair.getSshKeyPair(keyPath, 30000)

        const keyAfter = await vscode.workspace.fs.readFile(vscode.Uri.file(keyPath))
        sinon.assert.calledOnce(generateStub)

        assert.notStrictEqual(keyBefore, keyAfter)
        sinon.restore()
    })

    it('deletes key on delete', async function () {
        const pubKeyExistsBefore = await fs.pathExists(keyPair.getPublicKeyPath())
        const privateKeyExistsBefore = await fs.pathExists(keyPair.getPrivateKeyPath())

        await keyPair.delete()

        const pubKeyExistsAfter = await fs.pathExists(keyPair.getPublicKeyPath())
        const privateKeyExistsAfter = await fs.pathExists(keyPair.getPrivateKeyPath())

        assert.strictEqual(pubKeyExistsBefore && privateKeyExistsBefore, true)
        assert.strictEqual(pubKeyExistsAfter && privateKeyExistsAfter, false)
        assert(keyPair.isDeleted())
    })

    it('deletes keys after timeout', async function () {
        // Stub methods interacting with file system to avoid flaky test.
        sinon.stub(SshKeyPair, 'generateSshKeyPair')
        const deleteStub = sinon.stub(SshKeyPair.prototype, 'delete')

        keyPair = await SshKeyPair.getSshKeyPair(keyPath, 50)
        await clock.tickAsync(10)
        sinon.assert.notCalled(deleteStub)
        await clock.tickAsync(100)
        sinon.assert.calledOnce(deleteStub)
        sinon.restore()
    })
})
