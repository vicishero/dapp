import React, { Component } from 'react';
import PropTypes from 'prop-types';
import ReactMarkdown from 'react-markdown'

import 'styles/Dapp.css';
const metadataParser = require('markdown-yaml-metadata-parser');

export default class Markdown extends Component {
  static propTypes = {
    link: PropTypes.string,
  }

  constructor(props) {
    super(props);
    this.state = {
      text: ''
    };
  }

  componentDidMount() {
    if (this.props.link) this.getMarkdown();
  }

  getMarkdown() {
    let xmlHttp = new XMLHttpRequest();
    xmlHttp.open('GET', this.props.link, false);
    xmlHttp.send(null);
    console.log(xmlHttp.responseText);
    let parsedContent = metadataParser(xmlHttp.responseText);
    console.log(parsedContent);
    this.setState({ text: parsedContent.content });
  }

  render() {
    return (
      <>
        {
          (this.state.text) ?
            <div className="markdown">
              <ReactMarkdown children={this.state.text} />
            </div>
          :
          null
        }
      </>
    );
  }
}
