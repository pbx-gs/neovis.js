'use strict';

//uncomment for wallabyjs
//import * as  neo4j from  '../vendor/neo4j-javascript-driver/lib/index.js'

//uncomment for webpack
 import * as neo4j from '../vendor/neo4j-javascript-driver/lib/browser/neo4j-web.js';
 import '../vendor/vis/dist/vis-network.min.css';

//ok on both
import * as vis from '../vendor/vis/dist/vis-network.min.js';
import { defaults } from './defaults';


export default class NeoVis {

    /**
     *
     * @constructor
     * @param {object} config - configures the visualization and Neo4j server connection
     *  {
     *    container:
     *    server_url:
     *    server_password?:
     *    server_username?:
     *    labels:
     *
     *  }
     *
     */

    constructor(config = {}) {
        this._config    = config;
        this._encrypted = config.encrypted      || defaults.neo4j.encrypted
        this._trust     = config.trust          || defaults.neo4j.trust;
        this._query     = config.initial_cypher || defaults.neo4j.initialQuery;
        //this._driver    = neo4j.v1.driver(config.server_url || defaults.neo4j.neo4jUri, neo4j.v1.auth.basic(config.server_user || defaults.neo4j.neo4jUser, config.server_password || defaults.neo4j.neo4jPassword), {encrypted: this._encrypted, trust: this._trust});
        this._nodes     = {};
        this._edges     = {};
        this._data      = {};
        this._network   = null;
        this._vis       = vis
        this._options   = this.getOptions();
    }

    _setup_Driver() {
        let url      = this._config.server_url                      || defaults.neo4j.neo4jUri;
        let user     = this._config.server_user                     || defaults.neo4j.neo4jUser;
        let pwd      = this._config.server_password                 || defaults.neo4j.neo4jPassword;
        let auth     = neo4j.v1.auth.basic(user, pwd)
        let options  = { encrypted: this._encrypted , trust: this._trust };
        this._driver = neo4j.v1.driver(url, auth, options);
    }

    _setup_Container() {
        this._container = document.getElementById(this._config.container_id);
    }

    _addNode(node) {
        this._nodes[node.id] = node;
    }

    _addEdge(edge) {
        this._edges[edge.id] = edge;
    }

    /**
     * Build node object for vis from a neo4j Node
     * FIXME: use config
     * FIXME: move to private api
     * @param n
     * @returns {{}}
     */
     buildNodeVisObject(n) {

        var self = this;
        let node = {};
        let label = n.labels[0];

        let captionKey   = this._config && this._config.labels && this._config.labels[label] && this._config.labels[label]['caption'   ],
            sizeKey      = this._config && this._config.labels && this._config.labels[label] && this._config.labels[label]['size'      ],
            sizeCypher   = this._config && this._config.labels && this._config.labels[label] && this._config.labels[label]['sizeCypher'],
            color        = this._config && this._config.labels && this._config.labels[label] && this._config.labels[label]['color'     ],
            icon         = this._config && this._config.labels && this._config.labels[label] && this._config.labels[label]['icon'      ],
            image        = this._config && this._config.labels && this._config.labels[label] && this._config.labels[label]['image'     ],
            communityKey = this._config && this._config.labels && this._config.labels[label] && this._config.labels[label]['community' ],
            mass         = this._config && this._config.labels && this._config.labels[label] && this._config.labels[label]['mass'      ],
            shape        = this._config && this._config.labels && this._config.labels[label] && this._config.labels[label]['shape'     ],
            size         = this._config && this._config.labels && this._config.labels[label] && this._config.labels[label]['size'      ],
            labelValue   = this._config && this._config.labels && this._config.labels[label] && this._config.labels[label]['label'     ];


        node['id'] = n.identity.toInt();

        // node size

        if (sizeCypher) {
            // use a cypher statement to determine the size of the node
            // the cypher statement will be passed a parameter {id} with the value
            // of the internal node id

            let session = this._driver.session();
            session.run(sizeCypher, {id: neo4j.v1.int(node['id'])})
                .then(function (result) {
                    result.records.forEach(function (record) {
                        record.forEach(function (v, k, r) {
                            if (typeof v === "number") {
                                self._addNode({id: node['id'], value: v});
                            } else if (v.constructor.name === "Integer") {
                                self._addNode({id: node['id'], value: v.toNumber()})
                            }
                        })
                    })
                })


        } else if (typeof sizeKey === "number") {
            node['value'] = sizeKey;
        } else {

            let sizeProp = n.properties[sizeKey];

            if (sizeProp && typeof sizeProp === "number") {
                // propety value is a number, OK to use
                node['value'] = sizeProp;
            } else if (sizeProp && typeof sizeProp === "object" && sizeProp.constructor.name === "Integer") {
                // property value might be a Neo4j Integer, check if we can call toNumber on it:
                if (sizeProp.inSafeRange()) {
                    node['value'] = sizeProp.toNumber();
                } else {
                    // couldn't convert to Number, use default
                    node['value'] = 1.0;
                }
            } else {
                node['value'] = 1.0;
            }
        }

        // node caption
        node['label'] = n.properties[captionKey] || label || "";

        //shape
        // if (shape) { node['shape'] = shape         }
        // if (size ) { node['font' ] = {size: size } }

        // community
        // behavior: color by value of community property (if set in config), then color by label
        if (!communityKey) {
            node['group'] = label;
        } else {
            try {
                if (n.properties[communityKey]) {
                    node['group'] = n.properties[communityKey].toNumber() || label || 0;  // FIXME: cast to Integer

                }
                else {
                    node['group'] = 0;
                }

            } catch(e) {
                node['group'] = 0;
            }
        }


        // set all properties as tooltip
        node['title'] = "";
        for (let key in n.properties) {
            if (n.hasOwnProperty(key))                                                                  // DC Change (check if it has side effects)
                node['title'] += "<strong>" + key + ":</strong>" + " " + n.properties[key] + "<br>";
        }

        if (color     ) { node['color'] = color; delete node['group']; }
        if (labelValue) { node['label'] = labelValue    }
        if (mass      ) { node['mass' ] = mass          }
        if (shape     ) { node['shape'] = shape         }
        if (size      ) { node['font' ] = {size: size } }
        if (icon      ) {
            node['shape'] = 'icon'
            node['icon' ] = { face: 'FontAwesome',  code: icon , color   : color }
            }
        if (image     ) {
            node['shape' ] = 'image'

            node['image' ] = image
        }

        return node;
    }

    /**
     * Build edge object for vis from a neo4j Relationship
     * @param r
     * @returns {{}}
     */
    buildEdgeVisObject(r) {

        let weightKey  = this._config && this._config.relationships && this._config.relationships[r.type] && this._config.relationships[r.type]['size'   ],
            captionKey = this._config && this._config.relationships && this._config.relationships[r.type] && this._config.relationships[r.type]['caption'],
            label      = this._config && this._config.relationships && this._config.relationships[r.type] && this._config.relationships[r.type]['label'  ],
            color      = this._config && this._config.relationships && this._config.relationships[r.type] && this._config.relationships[r.type]['color'  ],
            arrow      = this._config && this._config.relationships && this._config.relationships[r.type] && this._config.relationships[r.type]['arrow'  ],
            dashes     = this._config && this._config.relationships && this._config.relationships[r.type] && this._config.relationships[r.type]['dashes' ];


        let edge = {};
        edge['id'  ] = r.identity.toInt();
        edge['from'] = r.start.toInt();
        edge['to'  ] = r.end.toInt();

        // hover tooltip. show all properties in the format <strong>key:</strong> value
        edge['title'] = "";
        for (let key in r.properties) {
            edge['title'] += "<strong>" + key + ":</strong>" + " " + r.properties[key] + "<br>";
        }

        // set relationship thickness (using width value )
        if (weightKey && typeof weightKey === "string") {
            edge['width'] = r.properties[weightKey];
        } else if (weightKey && typeof weightKey === "number") {
            edge['width'] = weightKey;
        }
        else {
            edge['width'] = 1.0;
        }

        // set caption
        if (typeof captionKey === "boolean") {
            if (!captionKey) {
                edge['label'] = "";
            } else {
                edge['label'] = r.type;
            }
        } else if (captionKey && typeof captionKey === "string") {
            edge['label']  = r.properties[captionKey] || "";
        } else {
            edge['label'] = r.type;
        }

        if (arrow ) { edge['arrows'] = { to  : { enabled: true } } }
        if (color ) { edge['color' ] = { color: color            } }
        if (dashes) { edge['dashes'] = true                        }
        if (label)  { edge['label' ] = label                       }




        return edge;
    }

    handle_Node(value) {
        let self = this;
        let node = self.buildNodeVisObject(value);

        try {
            self._addNode(node);
        } catch(e) {
            console.log(e);
        }
    }
    handle_Path(value) {
        let self = this;
        let n1 = self.buildNodeVisObject(value.start);
        let n2 = self.buildNodeVisObject(value.end);

        self._addNode(n1);
        self._addNode(n2);

        value.segments.forEach((obj) => {

            self._addNode(self.buildNodeVisObject(obj.start));
            self._addNode(self.buildNodeVisObject(obj.end))
            self._addEdge(self.buildEdgeVisObject(obj.relationship))
        });
    }

    handle_Relationship(value) {
        let self = this;
        let edge = self.buildEdgeVisObject(value);

        try {
            self._addEdge(edge);
        } catch(e) {
            console.log(e);
        }
    }

    handle_Array(value) {
        let self = this;
        value.forEach(function(obj) {
            if (obj.constructor.name === "Node") {
                let node = self.buildNodeVisObject(obj);

                try {
                    self._addNode(node);
                } catch(e) {
                    console.log(e);
                }
            }
            else if (obj.constructor.name === "Relationship") {
                let edge = self.buildEdgeVisObject(obj);

                try {
                    self._addEdge(edge);
                } catch(e) {
                    console.log(e);
                }
            }
        });
    }

    handle_onNext (record) {
        let self = this;
        record.forEach(function(v, k, r) {
            if      (v.constructor.name === "Node"          ) { self.handle_Node(v)         }
            else if (v.constructor.name === "Relationship"  ) { self.handle_Relationship(v) }
            else if (v.constructor.name === "Path"          ) { self.handle_Path(v)         }
            else if (v.constructor.name === "Array"         ) { self.handle_Array(v)        }
        })
    }

    handle_onCompleted(callback) {
        let self    = this;
        let session = this._driver.session();

        session.close();
        self.createVisGraph(self._nodes, self._edges)
        //setTimeout(() => { self._network.stopSimulation(); }, 10000);

        if(callback)
            callback()
    }

    handle_onError (error,callback) {
        if(callback)
            callback(error)
        else
            console.log(error);
    }

    // public API
    setup () {
        this._setup_Driver()
        this._setup_Container()
        return this;
    }

    async exec_Neo4j_query(query) {
        let self = this;
        self._setup_Driver()
        let session = self._driver.session();
        return await session.run(query, {limit: 30})
                .then((result)=>{
                    session.close();
                    self._records = result.records
                    return result
                })
    }

    transform_Neo4j_Records_To_VisJs () {
        let self = this;

        self._records.forEach (function(record) {
            self.handle_onNext(record)
        })
        return self
    }

    create_Network_Graph(){
        let self = this;
        self.createVisGraph(self._nodes, self._edges)
        setTimeout(() => { self._network.stopSimulation(); }, 10000);
    }

    async render_async() {
        let self     = this;

        await self.exec_Neo4j_query(self._query)
        self.transform_Neo4j_Records_To_VisJs()
            .create_Network_Graph()
    }

    render(callback) {
        this.setup()

        let self    = this;
        let session = this._driver.session();
        session.run(this._query, {limit: 30})
               .subscribe({
                    onNext     : function (record) { self.handle_onNext     ( record           ) },
                    onCompleted: function ()       { self.handle_onCompleted( callback         ) },
                    onError    : function (error)  { self.handle_onError    ( error, callback  ) },
                });
        return session
        };

    createVisGraph(nodes, edges) {
        let self = this;
        self._data = {
            "nodes": new vis.DataSet(Object.values(nodes)),
            "edges": new vis.DataSet(Object.values(edges))
        }
        self._network = new vis.Network(self._container, self._data, self._options);
    }

    getOptions() {
        let self = this;
        return {}
        let options = {
            nodes: {
                shape: 'dot',
                font: {
                    size: 26,
                    strokeWidth: 7
                },
                scaling: {
                    label: {
                        enabled: true
                    }
                }
            },
            edges: {
                arrows: {
                    to: {enabled: self._config.arrows || false } // FIXME: handle default value
                },
                length: 200
            },
            layout: {
                improvedLayout: false,
                hierarchical: {
                    enabled: self._config.hierarchical || false,
                    sortMethod: self._config.hierarchical_sort_method || "hubsize"

                }
            },
            physics: { // TODO: adaptive physics settings based on size of graph rendered
                // enabled: true,
                // timestep: 0.5,
                // stabilization: {
                //     iterations: 10
                // }

                adaptiveTimestep: true,
                barnesHut: {
                    gravitationalConstant: -8000,
                    springConstant: 0.04,
                    springLength: 95
                },
                stabilization: {
                    iterations: 200,
                    fit: true
                }

            }
        };
        return options;
    }
    /**
     * Clear the data for the visualization
     */
    clearNetwork() {
        this._nodes = {}
        this._edges = {};
        this._network.setData([]);
    }


    /**
     * Reset the config object and reload data
     * @param config
     */
    reinit(config) {

    };

    /**
     * Fetch live data form the server and reload the visualization
     */
    reload() {

        this.clearNetwork();
        this.render();


    };

    /**
     * Stabilize the visuzliation
     */
    stabilize() {
        this._network.stopSimulation();
        console.log("Calling stopSimulation");
    }

    /**
     * Execute an arbitrary Cypher query and re-render the visualization
     * @param query
     */
    renderWithCypher(query) {

        //self._config.initial_cypher = query;

        this.clearNetwork();
        this._query = query;
        this.render();

    };

    // configure exports based on environment (ie Node.js or browser)
    //if (typeof exports === 'object') {
    //    module.exports = NeoVis;
    //} else {
    //    define (function () {return NeoVis;})
    //}
}

