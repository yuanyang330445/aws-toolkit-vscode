/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import * as vscode from 'vscode'
import { AWSTreeNodeBase } from '../../shared/treeview/nodes/awsTreeNodeBase'
import { makeChildrenNodes } from '../../shared/treeview/utils'
import { PlaceholderNode } from '../../shared/treeview/nodes/placeholderNode'
import { Ec2InstanceNode } from './ec2InstanceNode'
import { Ec2Client } from '../../shared/clients/ec2Client'
import { updateInPlace } from '../../shared/utilities/collectionUtils'
import { Commands } from '../../shared/vscode/commands'
import globals from '../../shared/extensionGlobals'

export const parentContextValue = 'awsEc2ParentNode'
export type Ec2Node = Ec2InstanceNode | Ec2ParentNode

const pollingInterval = 3000

export class Ec2ParentNode extends AWSTreeNodeBase {
    protected readonly placeHolderMessage = '[No EC2 Instances Found]'
    protected ec2InstanceNodes: Map<string, Ec2InstanceNode>
    public override readonly contextValue: string = parentContextValue
    protected pollingNodes: Set<Ec2InstanceNode> = new Set<Ec2InstanceNode>()
    private pollTimer?: NodeJS.Timeout

    public constructor(
        public override readonly regionCode: string,
        public readonly partitionId: string,
        protected readonly ec2Client: Ec2Client
    ) {
        super('EC2', vscode.TreeItemCollapsibleState.Collapsed)
        this.ec2InstanceNodes = new Map<string, Ec2InstanceNode>()
    }

    public override async getChildren(): Promise<AWSTreeNodeBase[]> {
        return await makeChildrenNodes({
            getChildNodes: async () => {
                await this.updateChildren()

                return [...this.ec2InstanceNodes.values()]
            },
            getNoChildrenPlaceholderNode: async () => new PlaceholderNode(this, this.placeHolderMessage),
            sort: (nodeA, nodeB) => nodeA.name.localeCompare(nodeB.name),
        })
    }

    public async updateChildren(): Promise<void> {
        const ec2Instances = await (await this.ec2Client.getInstances()).toMap(instance => instance.InstanceId)
        updateInPlace(
            this.ec2InstanceNodes,
            ec2Instances.keys(),
            key => this.ec2InstanceNodes.get(key)!.updateInstance(ec2Instances.get(key)!),
            key => new Ec2InstanceNode(this, this.ec2Client, this.regionCode, this.partitionId, ec2Instances.get(key)!)
        )
    }

    public isPolling(): boolean {
        return this.pollingNodes.size !== 0
    }

    public startPolling(childNode: Ec2InstanceNode) {
        this.pollingNodes.add(childNode)
        this.pollTimer =
            this.pollTimer ?? globals.clock.setInterval(this.updatePollingNodes.bind(this), pollingInterval)
    }

    public updatePollingNodes() {
        this.pollingNodes.forEach(async childNode => {
            await childNode.updateStatus()

            if (childNode.getStatus() != 'pending') {
                this.pollingNodes.delete(childNode)
            }
        })
        this.refreshNode()
    }

    public async clearChildren() {
        this.ec2InstanceNodes = new Map<string, Ec2InstanceNode>()
    }

    public async refreshNode(): Promise<void> {
        this.clearChildren()
        Commands.vscode().execute('aws.refreshAwsExplorerNode', this)
    }
}
