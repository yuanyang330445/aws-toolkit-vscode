/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as sinon from 'sinon'
import assert from 'assert'
import {
    Ec2InstanceNode,
    Ec2InstancePendingContext,
    Ec2InstanceRunningContext,
    Ec2InstanceStoppedContext,
    refreshExplorerNode,
} from '../../../../awsService/ec2/explorer/ec2InstanceNode'
import { Ec2Client, SafeEc2Instance, getNameOfInstance } from '../../../../shared/clients/ec2Client'
import { Ec2ParentNode } from '../../../../awsService/ec2/explorer/ec2ParentNode'
import { DefaultAwsContext } from '../../../../shared'

describe('ec2InstanceNode', function () {
    let testNode: Ec2InstanceNode
    let testInstance: SafeEc2Instance
    const testRegion = 'testRegion'
    const testPartition = 'testPartition'

    before(function () {
        testInstance = {
            InstanceId: 'testId',
            Tags: [
                {
                    Key: 'Name',
                    Value: 'testName',
                },
            ],
            LastSeenStatus: 'running',
        }
        const testClient = new Ec2Client('')
        const testParentNode = new Ec2ParentNode(testRegion, testPartition, testClient)
        testNode = new Ec2InstanceNode(testParentNode, testClient, 'testRegion', 'testPartition', testInstance)
    })

    this.beforeEach(function () {
        testNode.updateInstance(testInstance)
    })

    it('instantiates without issue', async function () {
        assert.ok(testNode)
    })

    it('initializes the region code', async function () {
        assert.strictEqual(testNode.regionCode, 'testRegion')
    })

    it('initializes the label', async function () {
        assert.strictEqual(
            testNode.label,
            `${getNameOfInstance(testInstance)} (${testInstance.InstanceId}) ${testInstance.LastSeenStatus.toUpperCase()}`
        )
    })

    it('initializes the functionName', async function () {
        assert.strictEqual(testNode.name, getNameOfInstance(testInstance))
    })

    it('has no children', async function () {
        const childNodes = await testNode.getChildren()
        assert.ok(childNodes)
        assert.strictEqual(childNodes.length, 0, 'Expected node to have no children')
    })

    it('has an EC2ParentNode as parent', async function () {
        assert.ok(testNode.parent instanceof Ec2ParentNode)
    })

    it('intializes the client', async function () {
        assert.ok(testNode.client instanceof Ec2Client)
    })

    it('sets context value based on status', async function () {
        const stoppedInstance = { ...testInstance, LastSeenStatus: 'stopped' }
        testNode.updateInstance(stoppedInstance)
        assert.strictEqual(testNode.contextValue, Ec2InstanceStoppedContext)

        const runningInstance = { ...testInstance, LastSeenStatus: 'running' }
        testNode.updateInstance(runningInstance)
        assert.strictEqual(testNode.contextValue, Ec2InstanceRunningContext)

        const pendingInstance = { ...testInstance, LastSeenStatus: 'pending' }
        testNode.updateInstance(pendingInstance)
        assert.strictEqual(testNode.contextValue, Ec2InstancePendingContext)
    })

    it('updates status with new instance', async function () {
        const newStatus = 'pending'
        const newIdInstance = { ...testInstance, InstanceId: 'testId2', LastSeenStatus: newStatus }
        testNode.updateInstance(newIdInstance)
        assert.strictEqual(testNode.getStatus(), newStatus)
    })

    describe('refreshExplorerNode', function () {
        let testInstance: SafeEc2Instance
        let testParentNode: Ec2ParentNode
        let testClient: Ec2Client
        let testNode: Ec2InstanceNode

        before(function () {
            sinon.stub(DefaultAwsContext.prototype, 'getCredentialAccountId')
            testInstance = {
                InstanceId: 'testId',
                Tags: [
                    {
                        Key: 'Name',
                        Value: 'testName',
                    },
                ],
                LastSeenStatus: 'running',
            }
            testClient = new Ec2Client('')
            testParentNode = new Ec2ParentNode('fake-region', 'testPartition', testClient)
            testNode = new Ec2InstanceNode(testParentNode, testClient, 'testRegion', 'testPartition', testInstance)
        })

        after(function () {
            sinon.restore()
        })

        it('refreshes only parent node', async function () {
            const testParentNode = new Ec2ParentNode('fake-region', 'testPartition', testClient)
            const parentRefresh = sinon.stub(Ec2ParentNode.prototype, 'refreshNode')
            const childRefresh = sinon.stub(Ec2InstanceNode.prototype, 'refreshNode')

            await refreshExplorerNode(testNode)

            sinon.assert.called(parentRefresh)
            sinon.assert.notCalled(childRefresh)

            parentRefresh.resetHistory()

            await refreshExplorerNode(testParentNode)

            sinon.assert.called(parentRefresh)
            sinon.assert.notCalled(childRefresh)

            parentRefresh.restore()
            childRefresh.restore()
        })
    })
})
