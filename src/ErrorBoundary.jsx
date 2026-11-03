import {Component} from 'react';
export class ErrorBoundary extends Component{
 constructor(props){super(props);this.state={failed:false};}
 static getDerivedStateFromError(){return{failed:true};}
 componentDidCatch(error){console.error('Terra Workshop renderer error:',error);}
 render(){return this.state.failed?<div className="boot"><h1>界面暂时无法加载</h1><p>请重新加载工坊，再继续操作。</p><button onClick={()=>location.reload()}>重新加载</button></div>:this.props.children;}
}
