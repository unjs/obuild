export const JsxComponent = () => {
  return (
    <div className="comment">
      <h2 className="commentAuthor">{this.props.author}</h2>
      {this.props.children}
    </div>
  );
};
