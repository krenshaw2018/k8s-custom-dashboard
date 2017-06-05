import React from 'react'
import axios from 'axios';
import { Link } from 'react-router'
import moment from 'moment';
import Pod from './elements/Pod'
import { browserHistory } from 'react-router';

let timer;


const getClassFromType = function(type) {
  let className = '';
  if (type === 'Warning') {
    className = 'danger';
  }
  return className;
};


const displayInvolvedObject = function(involvedObject) {
  let html;
  if (involvedObject.kind === 'Pod') {
    html = <Link to={"/namespaces/"+ involvedObject.namespace +"/pods/"+ involvedObject.name}>Pod {involvedObject.name}</Link>;
  } else {
    html = involvedObject.kind + ' ' + involvedObject.name;
  }
  return html;
};


export default React.createClass({
  getInitialState: function() {
    return {
      hpa: {
        spec: {
          minReplicas: 0,
          maxReplicas: 0
        },
        status: {
          currentCPUUtilizationPercentage: 0,
          currentReplicas: 0,
          desiredReplicas: 0
        }
      },
      events: [],
      filteredEvents: [],
      isLoading: false,
      warningCount: 0,
      pods: [],
      filteredPods: [],
      refreshValue: '0',
      namespace: '',
      appname: '',
      hasHPA: true
    }
  },


  componentWillReceiveProps: function (nextProps) {
    console.log('In componentWillReceiveProps...');
    // Only load if params have changed
    if (!nextProps.params.namespace
      || nextProps.params.namespace != this.props.params.namespace
      || nextProps.params.appname != this.props.params.appname) {

      clearInterval(timer);
      let namespace = nextProps.params.namespace;
      let appname = nextProps.params.appname;
      this.setState({namespace: namespace, appname: appname});
      if (namespace && appname) {
        this.loadDocument(namespace, appname);
        let refreshValue = this.state.refreshValue;
        if (refreshValue != undefined && refreshValue != '0') {
          const refreshInterval = parseInt(refreshValue) * 1000;
          this.startRefresh(refreshInterval, namespace, appname);
        }
      }
    }
  },


  componentWillUnmount: function() {
    if (timer) {
      clearInterval(timer);
    }
  },


  startRefresh: function(refreshInterval, namespace, appname) {
    console.log('In startRefresh for: namespace=' + namespace + ' appname=' + appname);
    let loadDocument = this.loadDocument;
    timer = setInterval(function(x, y) {
      loadDocument(x, y);
    }, refreshInterval, namespace, appname);
  },


  handleRefreshChange: function(event) {
    const refreshValue = event.target.value;
    this.setState({refreshValue: refreshValue});
    if (refreshValue === "0") {
      clearInterval(timer);
    } else {
      const refreshInterval = parseInt(refreshValue) * 1000;
      this.startRefresh(refreshInterval, this.state.namespace, this.state.appname);
    }
  },


  handleSubmit(event) {
    event.preventDefault();
    const namespace = this.refs.namespace.value;
    const appname = this.refs.appname.value;
    this.setState({
      namespace: namespace,
      appname: appname
    });
    browserHistory.push('/static/#/scaling/' + namespace + '/' + appname);
    this.loadDocument(namespace, appname);
  },


  loadDocument: function(namespace, appname) {
    console.log('In Scaling: loadDocument... namespace: ' + namespace + ' appname: ' + appname);
    if (!namespace || !appname) {
      console.log('Missing params in loadDocument: ' + namespace + '; ' + appname);
      return;
    }

    const _this = this;

    // Get HPA
    axios.get('/apis/extensions/v1beta1/namespaces/' + namespace + '/horizontalpodautoscalers/' + appname)
      .then(res => {
        this.setState({
          hpa: res.data,
          hasHPA: true
        });
      })
      .catch(function (error) {
        console.log(error);
        _this.setState({
          hpa: {},
          hasHPA: false
        })
      });

    // Get Events
    axios.get('/api/v1/namespaces/' + namespace + '/events')
      .then(res => {
        let events = [];
        let filteredEvents = [];
        let warningCount = 0;
        if (res.data.items) {
          // Sort descending
          events = res.data.items.sort(function(a, b) {return b.lastTimestamp.localeCompare(a.lastTimestamp);});
          const eventsLength = events.length;
          for (let i = 0; i < eventsLength; i++) {
            if (events[i].type === 'Warning') {
              warningCount += 1;
            }
            if (events[i].involvedObject.name.startsWith(appname)) {
              filteredEvents.push(events[i]);
            }
          }
        }
        this.setState({ isLoading: false, events: events, filteredEvents: filteredEvents, warningCount: warningCount });
      });

    // Get Pods filtered by app name
    axios.get('/api/v1/namespaces/' + namespace + '/pods')
      .then(res => {
        let pods = [];
        let filteredPods = [];
        if (res.data.items) {
          // Sort by start time
          pods = res.data.items.sort(function(a, b) {
            if(a.status.startTime < b.status.startTime) return -1;
            if(a.status.startTime > b.status.startTime) return 1;
            return 0;
          });

          for (let i = 0; i < pods.length; i++) {
            if (pods[i].metadata.labels.app === appname) {
              filteredPods.push(pods[i]);
            }
          }
        }

        this.setState({
          pods: pods,
          filteredPods: filteredPods
        });
      });

  },


  componentDidMount: function() {
    let namespace = this.props.params.namespace;
    let appname = this.props.params.appname;

    this.setState({
      namespace: namespace,
      appname: appname
    });

    if (namespace && appname) {
      this.loadDocument(namespace, appname);
    }
  },


  render() {
    return (
      <div>
        <h1>Pod Auto-Scaling</h1>

        {this.state.namespace &&
        <div>
          <form>
            <label>Refresh:</label>
            <select name="refreshInterval" onChange={this.handleRefreshChange}>
              <option value="0">No Refresh</option>
              <option value="2">2 Seconds</option>
              <option value="5">5 Seconds</option>
              <option value="10">10 Seconds</option>
              <option value="30">30 Seconds</option>
            </select>
          </form>

          <div className="col-md-6">
            <h2>Pods</h2>
            <table className="table table-striped table-bordered table-hover table-condensed">
              <thead>
              <tr>
                <th>Name</th>
                <th>Status</th>
                <th>Started</th>
              </tr>
              </thead>
              <tbody>
              {this.state.filteredPods.map(pod =>
                <tr key={pod.metadata.name}>
                  <td><Link
                    to={"/namespaces/" + pod.metadata.namespace + "/pods/" + pod.metadata.name}>{pod.metadata.name}</Link>
                  </td>
                  <td>{pod.status.phase}</td>
                  <td>{moment(pod.status.startTime).format("MM/DD HH:mm:ss")}</td>
                </tr>
              )}
              </tbody>
            </table>
          </div>

          <div className="col-md-6">
            <h2>Horizontal Pod Autoscaling</h2>

            <table className="table table-striped table-bordered table-hover table-condensed">
              <thead>
              <tr>
                <th>Current CPU</th>
                <th>Current</th>
                <th>Desired</th>
                <th>Min</th>
                <th>Max</th>
              </tr>
              </thead>
              <tbody>
              <tr>
                <td className="text-center">{this.state.hpa.status.currentCPUUtilizationPercentage}%</td>
                <td className="text-center">{this.state.hpa.status.currentReplicas}</td>
                <td className="text-center">{this.state.hpa.status.desiredReplicas}</td>
                <td className="text-center">{this.state.hpa.spec.minReplicas}</td>
                <td className="text-center">{this.state.hpa.spec.maxReplicas}</td>
              </tr>
              </tbody>
            </table>
          </div>

          <div className="col-md-12">
            <h2>Events</h2>
            <table className="table table-striped table-bordered table-hover table-condensed">
              <thead>
              <tr>
                <th>Name</th>
                <th>Reason</th>
                <th>Message</th>
                <th>Count</th>
                <th>Last Time</th>
                <th>Type</th>
              </tr>
              </thead>
              <tbody>
              {this.state.filteredEvents.map(event =>
                <tr key={event.metadata.uid} className={getClassFromType(event.type)}>
                  <td>{displayInvolvedObject(event.involvedObject)}</td>
                  <td>{event.reason}</td>
                  <td>{event.message}</td>
                  <td className="text-right">{event.count}</td>
                  <td>{moment(event.lastTimestamp).format("HH:mm:ss.sss")}</td>
                  <td>{event.type}</td>
                </tr>
              )}
              </tbody>
            </table>
          </div>
        </div>
        }

      </div>
    )
  }
})