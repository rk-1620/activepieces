import { apId, ListTagsRequest, SeekPage, Tag } from '@activepieces/shared'
import { In } from 'typeorm'
import { repoFactory } from '../../core/db/repo-factory'
import { buildPaginator } from '../../helper/pagination/build-paginator'
import { paginationHelper } from '../../helper/pagination/pagination-utils'
import { TagEntity } from './tag-entity'
import { databaseConnection } from '../../../app/database/database-connection'
import { PieceTagEntity } from './pieces/piece-tag.entity'


const repo = repoFactory(TagEntity)


export const tagService = {
    async convertIdsToNames(platformId: string, names: string[]): Promise<string[]> {
        const tagEntities = await repo().findBy({
            platformId,
            name: In(names),
        })
        return tagEntities.map(tag => tag.id)
    },
    async findNamesByIds(tagIds: string[]): Promise<Record<string, string>> {
        const tagEntities = await repo().findBy({
            id: In(tagIds),
        })
        return tagEntities.reduce((acc, tag) => {
            acc[tag.id] = tag.name
            return acc
        }, {} as Record<string, string>)
    },
    async upsert(platformId: string, name: string): Promise<Tag> {
        const clonedName = name.trim().toLocaleLowerCase()
        const existingTag = await repo().findOneBy({ name: clonedName, platformId })
        if (existingTag) {
            return existingTag
        }
        await repo().upsert({ id: apId(), name: clonedName, platformId }, ['name', 'platformId'])
        return repo().findOneByOrFail({ name: clonedName, platformId })
    },

    async list({ platformId, request }: { platformId: string, request: ListTagsRequest }): Promise<SeekPage<Tag>> {
        const decodedCursor = paginationHelper.decodeCursor(request.cursor ?? null)
        const paginator = buildPaginator({
            entity: TagEntity,
            query: {
                limit: request.limit ?? 10,
                order: 'ASC',
                afterCursor: decodedCursor.nextCursor,
                beforeCursor: decodedCursor.previousCursor,
            },
        })
        const { data, cursor } = await paginator.paginate(
            repo().createQueryBuilder().where({ platformId }),
        )
        return paginationHelper.createPage<Tag>(data, cursor)
    },

    async delete(platformId: string, tagId: string): Promise<void> {
        const dataSource = databaseConnection()
        
        await dataSource.transaction(async (entityManager) => {
            // Check if tag exists and belongs to platform
            const tag = await entityManager.findOne(TagEntity, {
                where: { id: tagId, platformId }
            })
            
            if (!tag) {
                throw new Error('Tag not found')
            }
            
            await entityManager.delete(PieceTagEntity, { tagId })
            await entityManager.delete(TagEntity, { id: tagId })
        })
    }

}

