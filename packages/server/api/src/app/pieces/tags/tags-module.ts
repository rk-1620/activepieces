import { assertNotNullOrUndefined, EndpointScope, ListTagsRequest, PrincipalType, SeekPage, SetPieceTagsRequest, Tag, UpsertTagRequest } from '@activepieces/shared'
import { FastifyPluginAsyncTypebox, Type } from '@fastify/type-provider-typebox'
import { StatusCodes } from 'http-status-codes'
import { platformMustBeOwnedByCurrentUser } from '../../ee/authentication/ee-authorization'
import { pieceTagService } from './pieces/piece-tag.service'
import { tagService } from './tag-service'


export const tagsModule: FastifyPluginAsyncTypebox = async (app) => {
    app.addHook('preHandler', platformMustBeOwnedByCurrentUser)
    await app.register(tagsController, { prefix: '/v1/tags' })
}


const tagsController: FastifyPluginAsyncTypebox = async (fastify) => {

    fastify.get('/', ListTagsParams,
        async (request) => {
        const platformId = request.principal.platform.id
        assertNotNullOrUndefined(platformId, 'platformId')
        return tagService.list({
            platformId,
            request: request.query,
        })
    },
)

    fastify.post('/', UpsertTagParams, async (req, reply) => {
        const platformId = req.principal.platform.id
        const tag = await tagService.upsert(platformId, req.body.name)
        await reply.status(StatusCodes.CREATED).send(tag)
    })

    fastify.post('/pieces', setPiecesTagsParams, async (req, reply) => {
        const platformId = req.principal.platform.id
        const pieces = req.body.piecesName.map(pieceName => pieceTagService.set(platformId, pieceName, req.body.tags))
        await Promise.all(pieces)
        await reply.status(StatusCodes.CREATED).send({})
    })

    fastify.delete('/:tagId', DeleteTagParams, async (req, reply) => {
        const platformId = req.principal.platform.id
        const tagId = req.params.tagId
        
        try {
            await tagService.delete(platformId, tagId)
            await reply.status(StatusCodes.NO_CONTENT).send()
        } catch (error: any) {
            if (error.message === 'Tag not found') {
                await reply.status(StatusCodes.NOT_FOUND).send({
                    message: 'Tag not found'
                })
            } else {
                throw error
            }
        }
    })
}

const UpsertTagParams = {
    config: {
        allowedPrincipals: [PrincipalType.USER],
        scope: EndpointScope.PLATFORM,
    },
    schema: {
        body: UpsertTagRequest,
        response: {
            [StatusCodes.CREATED]: Tag,
        },
    },
}

const setPiecesTagsParams = {
    config: {
        allowedPrincipals: [PrincipalType.USER, PrincipalType.SERVICE],
        scope: EndpointScope.PLATFORM,
    },
    schema: {
        body: SetPieceTagsRequest,
        response: {
            [StatusCodes.CREATED]: Type.Object({}),
        },
    },
}

const ListTagsParams = {
    config: {
        allowedPrincipals: [PrincipalType.USER],
        scope: EndpointScope.PLATFORM,
    },
    schema: {
        querystring: ListTagsRequest,
        response: {
            [StatusCodes.OK]: SeekPage(Tag),
        },
    },
}

const DeleteTagParams = {
    config: {
        allowedPrincipals: [PrincipalType.USER],
        scope: EndpointScope.PLATFORM,
    },
    schema: {
        params: Type.Object({
            tagId: Type.String(),
        }),
        response: {
            [StatusCodes.NO_CONTENT]: Type.Null(),
            [StatusCodes.NOT_FOUND]: Type.Object({
                message: Type.String(),
            }),
        },
    },
}
