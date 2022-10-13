const moment = require('moment-timezone');
const {
    agentProvider,
    mockManager,
    fixtureManager,
    matchers
} = require('../utils/e2e-framework');
const {
    anyGhostAgent,
    anyUuid,
    anyLocalURL,
    anyISODateTime,
    anyObjectId,
    anyContentVersion,
    anyNumber
} = matchers;

const tierSnapshot = {
    id: anyObjectId,
    created_at: anyISODateTime,
    updated_at: anyISODateTime
};

const roleSnapshot = tierSnapshot;

const buildAuthorSnapshot = (roles = false) => {
    const authorSnapshot = {
        last_seen: anyISODateTime,
        created_at: anyISODateTime,
        updated_at: anyISODateTime
    };

    if (roles) {
        return {...authorSnapshot, roles: Array(1).fill(roleSnapshot)};
    }

    return authorSnapshot;
};

const buildPageSnapshotWithTiers = ({
    published,
    tiersCount,
    roles = false
}) => {
    return {
        id: anyObjectId,
        uuid: anyUuid,
        comment_id: anyObjectId,
        published_at: published ? anyISODateTime : null,
        created_at: anyISODateTime,
        updated_at: anyISODateTime,
        url: anyLocalURL,
        tiers: new Array(tiersCount).fill(tierSnapshot),
        primary_author: buildAuthorSnapshot(roles),
        authors: new Array(1).fill(buildAuthorSnapshot(roles))
    };
};

const buildPreviousPageSnapshotWithTiers = (tiersCount) => {
    return {
        tiers: new Array(tiersCount).fill(tierSnapshot),
        updated_at: anyISODateTime
    };
};

describe('page.* events', function () {
    let adminAPIAgent;
    let webhookMockReceiver;

    before(async function () {
        adminAPIAgent = await agentProvider.getAdminAPIAgent();
        await fixtureManager.init('integrations');
        await adminAPIAgent.loginAsOwner();
    });

    beforeEach(function () {
        webhookMockReceiver = mockManager.mockWebhookRequests();
    });

    afterEach(function () {
        mockManager.restore();
    });

    it('page.added event is triggered', async function () {
        const webhookURL = 'https://test-webhook-receiver.com/page-added/';
        await webhookMockReceiver.mock(webhookURL);
        await fixtureManager.insertWebhook({
            event: 'page.added',
            url: webhookURL
        });

        await adminAPIAgent
            .post('pages/')
            .body({
                pages: [
                    {
                        title: 'testing page.added webhook',
                        status: 'draft',
                        displayName: 'webhookz'
                    }
                ]
            })
            .expectStatus(201);

        await webhookMockReceiver.receivedRequest();

        webhookMockReceiver
            .matchHeaderSnapshot({
                'content-version': anyContentVersion,
                'content-length': anyNumber,
                'user-agent': anyGhostAgent
            })
            .matchBodySnapshot({
                page: {
                    current: buildPageSnapshotWithTiers({
                        published: false,
                        tiersCount: 2
                    })
                }
            });
    });

    it('page.scheduled event is triggered', async function () {
        const webhookURL = 'https://test-webhook-receiver.com/page-scheduled/';
        await webhookMockReceiver.mock(webhookURL);
        await fixtureManager.insertWebhook({
            event: 'page.scheduled',
            url: webhookURL
        });

        const res = await adminAPIAgent
            .post('pages/')
            .body({
                pages: [
                    {
                        title: 'testing page.scheduled webhook',
                        status: 'draft'
                    }
                ]
            })
            .expectStatus(201);

        const id = res.body.pages[0].id;
        const scheduledPage = res.body.pages[0];
        scheduledPage.status = 'scheduled';
        scheduledPage.published_at = moment().add(6, 'hours').toISOString();

        await adminAPIAgent
            .put('pages/' + id)
            .body({
                pages: [scheduledPage]
            })
            .expectStatus(200);

        await webhookMockReceiver.receivedRequest();

        webhookMockReceiver
            .matchHeaderSnapshot({
                'content-version': anyContentVersion,
                'content-length': anyNumber,
                'user-agent': anyGhostAgent
            })
            .matchBodySnapshot({
                page: {
                    current: buildPageSnapshotWithTiers({
                        published: true,
                        tiersCount: 2,
                        roles: true
                    }),
                    previous: buildPreviousPageSnapshotWithTiers(2)
                }
            });
    });
});