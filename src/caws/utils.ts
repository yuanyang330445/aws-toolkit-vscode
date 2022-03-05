/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { Window } from '../shared/vscode/window'
import * as localizedText from '../shared/localizedText'

import * as nls from 'vscode-nls'
import { cawsHelpUrl, cawsHostname, CawsOrg, CawsProject, CawsRepo } from '../shared/clients/cawsClient'
import { Commands } from '../shared/vscode/commands'
import { ContextChangeEventsArgs } from '../shared/awsContext'
import { isNonNullable } from '../shared/utilities/tsUtils'
import { CawsView } from './cawsView'
const localize = nls.loadMessageBundle()

export async function promptCawsNotConnected(window = Window.vscode(), commands = Commands.vscode()): Promise<void> {
    const connect = localize('AWS.command.caws.connect', 'Connect to CODE.AWS')
    return await window
        .showWarningMessage(
            localize('AWS.caws.badConnection', 'Not connected to CODE.AWS.'),
            connect,
            localizedText.viewDocs
        )
        .then(btn => {
            if (btn === connect) {
                commands.execute('aws.caws.connect')
            } else if (btn === localizedText.viewDocs) {
                vscode.env.openExternal(vscode.Uri.parse(cawsHelpUrl))
            }
        })
}

export function fixcookie(s: string): string {
    s = s.trim()
    s = s.replace(/cookie: /i, '')
    s = s.replace(/code-aws-cognito-session: ?/, 'code-aws-cognito-session=')
    return s
}

const USERS_MEMENTO_KEY = 'caws/users'

export async function onCredentialsChanged(
    ctx: vscode.ExtensionContext,
    viewProvider: CawsView,
    view: vscode.TreeView<unknown>,
    e: ContextChangeEventsArgs
) {
    view.title = e.cawsUsername ? `CODE.AWS (${e.cawsUsername})` : 'CODE.AWS'

    // vscode secrets API is only available in newer versions.
    if (e.cawsUsername && e.cawsSecret && ctx.secrets) {
        // This sets the OS keychain item "vscodeamazonwebservices.aws:caws/$user".
        ctx.secrets.store(`caws/${e.cawsUsername}`, e.cawsSecret)

        // The proposed interface is `{ [username: string]: Record<string, any> }` where the value
        // is metadata associated with the user
        await ctx.globalState.update(USERS_MEMENTO_KEY, {
            ...ctx.globalState.get(USERS_MEMENTO_KEY, {}),
            [e.cawsUsername]: {},
        })
    }

    viewProvider.refresh()
}

export async function getSavedCookies(
    memento: vscode.Memento,
    secrets: vscode.SecretStorage
): Promise<{ name: string; cookie: string }[]> {
    const names = memento.get<Record<string, unknown>>(USERS_MEMENTO_KEY, {})
    const cookies = await Promise.all(
        Object.keys(names).map(async name => {
            const cookie = await secrets.get(`caws/${name}`)
            return cookie ? { name, cookie } : undefined
        })
    )

    return cookies.filter(isNonNullable)
}

/**
 * Builds a web URL from the given CAWS object.
 */
export function toCawsUrl(o: CawsOrg | CawsProject | CawsRepo) {
    const prefix = `https://${cawsHostname}/organizations`
    let url: string
    if ((o as CawsRepo).project) {
        const r = o as CawsRepo
        url = `${prefix}/${r.org.name}/projects/${r.project.name}/source-repositories/${r.name}/view`
    } else if ((o as CawsProject).org) {
        const p = o as CawsProject
        url = `${prefix}/${p.org.name}/projects/${p.name}/view`
    } else {
        url = `${prefix}/${o.name}/view`
    }
    return url
}

export function openCawsUrl(o: CawsOrg | CawsProject | CawsRepo) {
    const url = toCawsUrl(o)
    vscode.env.openExternal(vscode.Uri.parse(url))
}
