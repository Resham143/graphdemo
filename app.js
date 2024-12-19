const http = require('http');
const express = require('express');
const neo4j = require('neo4j-driver');
const { error } = require('console');
const NodeCache = require('node-cache')

const myCache = new NodeCache();
var app = express();


const driver = neo4j.driver('neo4j+s://0ba5e2d5.databases.neo4j.io',
    neo4j.auth.basic('neo4j', '7sf3wQH8flXIZ54ursTnD53i8KUuPqjjHNiutBgruIw'));

const session = driver.session();
const sessionId = '1734515381255_session';

app.get('/graph/landing', (req, res) => {
    console.log('start');
    const cacheKey = `${sessionId}_landing`
    if (myCache.has(cacheKey)) {

        res.send({
            "data": myCache.get(cacheKey),
            "status": "success",
            "code": 0
        });
    }
    else {
        session.executeRead((tx) =>
            tx.run(`MATCH (n:Screen{transId:"${sessionId}"}) RETURN n ORDER BY n.nodeIndex limit 1`))
            .then(result => {
                console.log('success');

                const item = getElementId(result.records[0]._fields[0].properties);

                getTransactionsByPageId(item.nodeIndex).then(result1 => {



                    item["transactions"] = result1;


                    myCache.set(cacheKey, item);

                    res.send({
                        "data": item,
                        "status": "success",
                        "code": 0
                    });
                }).catch(error => {

                    console.log('error second step');
                    res.send({
                        "data": item,
                        "status": "success",
                        "code": 0
                    });
                });

            })
            .catch(error => {
                console.log('failed');
                res.send({
                    "data": null,
                    "status": "failed",
                    "code": 1
                });
            });
    }

});

app.get('/graph/screen/:nodeId', (req, res) => {
    console.log('start');
    var cacheKey = `${sessionId}_screen_${req.params.nodeId}`;
    var nextIndex = parseInt(req.params.nodeId) + 1;

    if (myCache.has(cacheKey)) {
        res.send({
            "data": myCache.get(cacheKey),
            "status": "success",
            "code": 0
        });
    }
    else {
        session.executeRead((tx) =>
            tx.run(`MATCH (n:Screen{nodeIndex:${req.params.nodeId},transId:"${sessionId}"}) RETURN n ORDER BY n.nodeIndex limit 1`))
            .then(result => {
                console.log('success');

                const item = getElementId(result.records[0]._fields[0].properties);

                getTransactionsByPageId(item.nodeIndex).then(result1 => {

                    item["transactions"] = result1;

                    myCache.set(cacheKey, item);

                    res.send({
                        "data": item,
                        "status": "success",
                        "code": 0
                    });
                }).catch(error => {

                    console.log(error);

                    res.send({
                        "data": item,
                        "status": "success",
                        "code": 0
                    });
                });

            })
            .catch(error => {

                console.log('failed');

                cacheKey = `${sessionId}_screen_${nextIndex}`;

                if (myCache.has(cacheKey)) {
                    res.send({
                        "data": myCache.get(cacheKey),
                        "status": "success",
                        "code": 0
                    });
                }
                else {
                    session.executeRead((tx) =>
                        tx.run(`MATCH (n:Screen{nodeIndex:${nextIndex},transId:"${sessionId}"}) RETURN n ORDER BY n.nodeIndex limit 1`))
                        .then(result => {
                            console.log('success');

                            const item = getElementId(result.records[0]._fields[0].properties);

                            getTransactionsByPageId(item.nodeIndex).then(result1 => {

                                item["transactions"] = result1;

                                myCache.set(cacheKey, item);

                                res.send({
                                    "data": item,
                                    "status": "success",
                                    "code": 0
                                });
                            }).catch(error => {

                                console.log(error);

                                res.send({
                                    "data": item,
                                    "status": "success",
                                    "code": 0
                                });
                            });

                        })
                        .catch(error => {

                            console.log('failed');

                            res.send({
                                "data": null,
                                "status": "failed",
                                "code": 1
                            });
                        });
                }

            });
    }
});

app.get('/graph/all', (req, res) => {
    console.log('start');
    const cacheKey = `${sessionId}_graph_all`
    if (myCache.has(cacheKey)) {
        res.send({
            "data": myCache.get(cacheKey),
            "message": "success",
            "statue": 0
        });
    }
    else {
        session.executeRead((tx) =>
            tx.run(`MATCH (n:Screen{transId:"${sessionId}"}) RETURN n ORDER BY n.nodeIndex`)
        )
            .then(result => {
                console.log('success');
                const list = [];

                result.records.map(record => {

                    list.push(record._fields[0].properties)

                })

                myCache.set(cacheKey, list);

                res.send({
                    "data": list,
                    "message": "success",
                    "statue": 0
                });

            })
            .catch(error => {
                console.log('failed');
                res.send({
                    "data": null,
                    "message": "failed",
                    "statue": 1
                });
            });
    }

});

async function getTransactionsByPageId(id) {

    const query = `MATCH p=({nodeIndex:${id},transId:'1734437243534_session'})-[:TRANSITIONS_TO]->() RETURN p`
    console.log(query);
    return session.executeRead((tx) =>
        tx.run(query)
    )
        .then(result => {
            console.log('success 2');
            const list = []
            var sortedList = result.records.sort(function (a, b) {
                return a._fields[0].segments[0].end.properties.nodeIndex - b._fields[0].segments[0].end.properties.nodeIndex
            })
            sortedList.map(record => {


                list.push({
                    "start": getElementId(record._fields[0].segments[0].start.properties),
                    "end": getElementId(record._fields[0].segments[0].end.properties),
                    "relationship": getElementId(record._fields[0].segments[0].relationship.properties)
                })

            });
            return list;
        })
        .catch(error => {
            console.log('failed 2');
            return [];
        });

}

function getElementId(item) {

    var widgetType = item.elementId.split('_')[0];
    var widgetIdList = item.elementId.split('/');
    var widgetId = widgetIdList[widgetIdList.length - 1];

    item["widgetType"] = widgetType;
    item["id"] = widgetId;

    return item;
}
const port = process.env.PORT || 3000
app.listen(port, () => console.log(`app listening to ${port}`));

