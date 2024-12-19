const http = require('http');
const express = require('express');
const neo4j = require('neo4j-driver');
const Redis = require('redis');

const app = express();
const port = process.env.PORT || 3000;
const SESSION_ID = '1734515381255_session';

// Redis client setup
const redisClient = Redis.createClient({
    url: process.env.REDIS_URL || 'redis://localhost:6379'
});

// Redis error handling
redisClient.on('error', (err) => console.error('Redis Client Error', err));

// Connect to Redis
(async () => {
    await redisClient.connect();
})();

// Neo4j setup
const driver = neo4j.driver(
    'neo4j+s://0ba5e2d5.databases.neo4j.io',
    neo4j.auth.basic('neo4j', '7sf3wQH8flXIZ54ursTnD53i8KUuPqjjHNiutBgruIw')
);
const session = driver.session();

// Cache helper functions
const CACHE_TTL = 3600; // 1 hour in seconds

const getFromCache = async (key) => {
    const data = await redisClient.get(key);
    return data ? JSON.parse(data) : null;
};

const setToCache = async (key, value) => {
    await redisClient.setEx(key, CACHE_TTL, JSON.stringify(value));
};

const sendResponse = (res, data, status = 'success', code = 0) => {
    res.send({ data, status, code });
};

const getElementId = (item) => {
    const widgetType = item.elementId.split('_')[0];
    const widgetIdList = item.elementId.split('/');
    const widgetId = widgetIdList[widgetIdList.length - 1];
    
    return {
        ...item,
        widgetType,
        id: widgetId
    };
};

async function getTransactionsByPageId(id) {
    const query = `
        MATCH p=({nodeIndex:$id, transId:$sessionId})-[:TRANSITIONS_TO]->() 
        RETURN p
    `;
    
    try {
        const result = await session.executeRead((tx) =>
            tx.run(query, { id, sessionId: SESSION_ID })
        );
        
        return result.records
            .sort((a, b) => 
                a._fields[0].segments[0].end.properties.nodeIndex - 
                b._fields[0].segments[0].end.properties.nodeIndex
            )
            .map(record => ({
                start: getElementId(record._fields[0].segments[0].start.properties),
                end: getElementId(record._fields[0].segments[0].end.properties),
                relationship: getElementId(record._fields[0].segments[0].relationship.properties)
            }));
    } catch (error) {
        console.error('Transaction query failed:', error);
        return [];
    }
}

app.get('/graph/landing', async (req, res) => {
    const cacheKey = `${SESSION_ID}_landing`;
    
    try {
        // Check Redis cache first
        const cachedData = await getFromCache(cacheKey);
        if (cachedData) {
            return sendResponse(res, cachedData);
        }

        const result = await session.executeRead((tx) =>
            tx.run(
                'MATCH (n:Screen{transId:$sessionId}) RETURN n ORDER BY n.nodeIndex LIMIT 1',
                { sessionId: SESSION_ID }
            )
        );

        const item = getElementId(result.records[0]._fields[0].properties);
        item.transactions = await getTransactionsByPageId(item.nodeIndex);
        
        // Store in Redis cache
        await setToCache(cacheKey, item);
        sendResponse(res, item);
    } catch (error) {
        console.error('Landing page query failed:', error);
        sendResponse(res, null, 'failed', 1);
    }
});

app.get('/graph/screen/:nodeId', async (req, res) => {
    const cacheKey = `${SESSION_ID}_screen_${req.params.nodeId}`;
    const nextIndex = parseInt(req.params.nodeId) + 1;

    try {
        // Check Redis cache
        const cachedData = await getFromCache(cacheKey);
        if (cachedData) {
            return sendResponse(res, cachedData);
        }

        const result = await session.executeRead((tx) =>
            tx.run(
                'MATCH (n:Screen{nodeIndex:$nodeId,transId:$sessionId}) RETURN n ORDER BY n.nodeIndex LIMIT 1',
                { nodeId: parseInt(req.params.nodeId), sessionId: SESSION_ID }
            )
        );

        if (result.records.length === 0) {
            // Try next index if current one not found
            return handleNextIndex(nextIndex, res);
        }

        const item = getElementId(result.records[0]._fields[0].properties);
        item.transactions = await getTransactionsByPageId(item.nodeIndex);
        
        await setToCache(cacheKey, item);
        sendResponse(res, item);
    } catch (error) {
        console.error('Screen query failed:', error);
        await handleNextIndex(nextIndex, res);
    }
});

async function handleNextIndex(nextIndex, res) {
    const nextCacheKey = `${SESSION_ID}_screen_${nextIndex}`;
    
    try {
        const cachedData = await getFromCache(nextCacheKey);
        if (cachedData) {
            return sendResponse(res, cachedData);
        }

        const result = await session.executeRead((tx) =>
            tx.run(
                'MATCH (n:Screen{nodeIndex:$nodeId,transId:$sessionId}) RETURN n ORDER BY n.nodeIndex LIMIT 1',
                { nodeId: nextIndex, sessionId: SESSION_ID }
            )
        );

        if (result.records.length === 0) {
            return sendResponse(res, null, 'failed', 1);
        }

        const item = getElementId(result.records[0]._fields[0].properties);
        item.transactions = await getTransactionsByPageId(item.nodeIndex);
        
        await setToCache(nextCacheKey, item);
        sendResponse(res, item);
    } catch (error) {
        console.error('Next index query failed:', error);
        sendResponse(res, null, 'failed', 1);
    }
}

app.get('/graph/all', async (req, res) => {
    const cacheKey = `${SESSION_ID}_graph_all`;
    
    try {
        const cachedData = await getFromCache(cacheKey);
        if (cachedData) {
            return sendResponse(res, cachedData);
        }

        const result = await session.executeRead((tx) =>
            tx.run(
                'MATCH (n:Screen{transId:$sessionId}) RETURN n ORDER BY n.nodeIndex',
                { sessionId: SESSION_ID }
            )
        );

        const list = result.records.map(record => record._fields[0].properties);
        
        await setToCache(cacheKey, list);
        sendResponse(res, list);
    } catch (error) {
        console.error('All graphs query failed:', error);
        sendResponse(res, null, 'failed', 1);
    }
});

// Cleanup handlers
process.on('SIGTERM', async () => {
    await redisClient.quit();
    await session.close();
    await driver.close();
    process.exit(0);
});

app.listen(port, () => console.log(`App listening on port ${port}`));

