/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import * as assert from 'assert'

import sinon from 'sinon'

import {
    ControllerSetup,
    createController,
    createMessenger,
    createSession,
    generateVirtualMemoryUri,
    sessionRegisterProvider,
    sessionWriteFile,
    assertTelemetry,
} from 'aws-core-vscode/test'
import { CurrentWsFolders, CodeGenState, FeatureDevClient, Messenger } from 'aws-core-vscode/amazonqFeatureDev'
import path from 'path'
import { fs } from 'aws-core-vscode/shared'

describe('session', () => {
    const conversationID = '12345'
    let messenger: Messenger

    beforeEach(() => {
        messenger = createMessenger()
    })

    afterEach(() => {
        sinon.restore()
    })

    describe('preloader', () => {
        it('emits start chat telemetry', async () => {
            const session = await createSession({ messenger, conversationID })

            await session.preloader('implement twosum in typescript')

            assertTelemetry('amazonq_startConversationInvoke', {
                amazonqConversationId: conversationID,
            })
        })
    })
    describe('insertChanges', async () => {
        afterEach(() => {
            sinon.restore()
        })

        let workspaceFolderUriFsPath: string
        const notRejectedFileName = 'notRejectedFile.js'
        const notRejectedFileContent = 'notrejectedFileContent'
        let uri: vscode.Uri
        let encodedContent: Uint8Array

        async function createCodeGenState() {
            const controllerSetup: ControllerSetup = await createController()

            const uploadID = '789'
            const tabID = '123'
            const workspaceFolders = [controllerSetup.workspaceFolder] as CurrentWsFolders
            workspaceFolderUriFsPath = controllerSetup.workspaceFolder.uri.fsPath
            uri = generateVirtualMemoryUri(uploadID, notRejectedFileName)

            const testConfig = {
                conversationId: conversationID,
                proxyClient: {} as unknown as FeatureDevClient,
                workspaceRoots: [''],
                uploadId: uploadID,
                workspaceFolders,
            }

            const codeGenState = new CodeGenState(
                testConfig,
                [
                    {
                        zipFilePath: notRejectedFileName,
                        relativePath: notRejectedFileName,
                        fileContent: notRejectedFileContent,
                        rejected: false,
                        virtualMemoryUri: uri,
                        workspaceFolder: controllerSetup.workspaceFolder,
                    },
                    {
                        zipFilePath: 'rejectedFile.js',
                        relativePath: 'rejectedFile.js',
                        fileContent: 'rejectedFileContent',
                        rejected: true,
                        virtualMemoryUri: generateVirtualMemoryUri(uploadID, 'rejectedFile.js'),
                        workspaceFolder: controllerSetup.workspaceFolder,
                    },
                ],
                [],
                [],
                tabID,
                0
            )
            const session = await createSession({ messenger, sessionState: codeGenState, conversationID })
            encodedContent = new TextEncoder().encode(notRejectedFileContent)
            await sessionRegisterProvider(session, uri, encodedContent)
            return session
        }
        it('only insert non rejected files', async () => {
            const fsSpyWriteFile = sinon.spy(fs, 'writeFile')
            const session = await createCodeGenState()
            await sessionWriteFile(session, uri, encodedContent)
            await session.insertChanges()

            const absolutePath = path.join(workspaceFolderUriFsPath, notRejectedFileName)

            assert.ok(fsSpyWriteFile.calledOnce)
            assert.ok(fsSpyWriteFile.calledWith(absolutePath, notRejectedFileContent))
        })
    })
})
