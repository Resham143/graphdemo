// function sayHello(name)
// {
//     console.log('Hello '+name);
// }

// sayHello('Resham');

const http = require('http');
const express = require('express');
const neo4j = require('neo4j-driver');
const { error } = require('console');
const driver = neo4j.driver('neo4j+s://0ba5e2d5.databases.neo4j.io',
    neo4j.auth.basic('neo4j', '7sf3wQH8flXIZ54ursTnD53i8KUuPqjjHNiutBgruIw'));


var app = express();

const session = driver.session();

const sessionId = 'n:Screen{transId:1734514097168_session';
app.get('/graph/landing', (req, res) => {
    console.log('start');
    session.executeRead((tx) =>
        tx.run('MATCH (n:Screen{transId:"1734515381255_session"}) RETURN n limit 1')
        //
    )
        .then(result => {
            console.log('success');
            const item = result.records[0]._fields[0].properties;

            getTransactionsByPageId(item.nodeIndex).then(result1 => {

                item["transactions"] = result1;

                res.send({
                    "data": item,
                    "status": "success",
                    "code": 200
                });
            }).catch(error => {

                console.log('error second step');
            });

        })
        .catch(error => {
            console.log('failed');
            res.send(error);
        });
});

app.get('/graph/all', (req, res) => {
    console.log('start');
    session.executeRead((tx) =>
        tx.run('MATCH (n:Screen{transId:"1734515381255_session"}) RETURN n')
        //
    )
        .then(result => {
            console.log('success');
            const list = []; result.records.map(record => {
                list.push((record._fields[0]))
                //.segments[0]
            });
            res.send(list);
        })
        .catch(error => {
            console.log('failed');
            res.send(error);
        });
});

app.get('/graph/screen/:nodeId', (req, res) => {
    console.log('start');

    session.executeRead((tx) =>
        tx.run(`MATCH (n:Screen{nodeIndex:${req.params.nodeId},transId:"1734515381255_session"}) RETURN n limit 1`)
        //
    )
        .then(result => {
            console.log('success');
            const item = result.records[0]._fields[0].properties;

            getTransactionsByPageId(item.nodeIndex).then(result1 => {

                item["transactions"] = result1;

                res.send({
                    "data": item,
                    "status": "success",
                    "code": 200
                });
            }).catch(error => {

                console.log('error second step');
            });

        })
        .catch(error => {
            console.log('failed');
            res.send(error);
        });
});

app.get('/graph/transactions', (req, res) => {
    console.log('start');

    session.executeRead((tx) =>
        tx.run(`MATCH (${sessionId}) RETURN DISTINCT n.nodeIndex`)
    )
        .then(result => {
            console.log('success');
            // const list = []
            // result.records.map(record => {
            //     list.push((record._fields[0]).segments[0].relationship.type)
            // });
            res.send(result);
        })
        .catch(error => {
            console.log('failed');
            res.send(error);
        });
});

app.get('/graph/screens/all', (req, res) => {

    console.log('start');
    session.executeRead((tx) =>
        tx.run(`MATCH (${sessionId}) RETURN n`)
    )
        .then(result => {
            console.log('success');
            const list = []
            result.records.map(record => {
                list.push((record._fields[0]).properties)
            });
            res.send(list);
        })
        .catch(error => {
            console.log('failed');
            res.send(error);
        });
});



app.get('/graph/sourceid/:sourceId', (req, res) => {
    res.send(req.params.sourceId);
})


async function getTransactionsByPageId(id) {

    const query = `MATCH p=({nodeIndex:${id},transId:'1734437243534_session'})-[:TRANSITIONS_TO]->() RETURN p`
    console.log(query);
    return session.executeRead((tx) =>
        tx.run(query)
    )
        .then(result => {
            console.log('success 2');
            const list = []
            result.records.map(record => {
                list.push({
                    "start": record._fields[0].segments[0].start.properties,
                    "end": record._fields[0].segments[0].end.properties,
                    "relationship": record._fields[0].segments[0].relationship.properties
                })

            });
            return list;
        })
        .catch(error => {
            console.log('failed 2');
            return [];
        });

}

const port = process.env.PORT || 3000
app.listen(port, () => console.log(`app listening to ${port}`));

