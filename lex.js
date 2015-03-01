(function(global) {
  "use strict";

  // Lexer
  var tokenType = {
    identifier: 1, numberLiteral: 2,
    equals: 100, arrow: 101, plus: 102, minus: 103, multiply: 104, divide: 105,
    letKeyword: 200, fnKeyword: 201, inKeyword: 202, semicolon: 203, ellipsis: 204,
    openParen: 300, closeParen: 301,
    eof: 900, whitespace: 901, error: 999,
  };

  function tokenTypeName(type) {
    var keys = Object.keys(tokenType);
    for (var i = 0, len = keys.length; i < len; i++) {
      if (type === tokenType[keys[i]]) {
        return keys[i];
      }
    }
    return "<unknown>";
  }

  var tokens = {
    equals:      { type: tokenType.equals,      value: "=",   length: 1 },
    arrow:       { type: tokenType.arrow,       value: "=>",  length: 2 },
    plus:        { type: tokenType.plus,        value: "+",   length: 1 },
    minus:       { type: tokenType.minus,       value: "-",   length: 1 },
    multiply:    { type: tokenType.multiply,    value: "*",   length: 1 },
    divide:      { type: tokenType.divide,      value: "/",   length: 1 },
    letKeyword:  { type: tokenType.letKeyword,  value: "let", length: 3, keyword: true },
    fnKeyword:   { type: tokenType.fnKeyword,   value: "fn",  length: 2, keyword: true },
    inKeyword:   { type: tokenType.inKeyword,   value: "in",  length: 2, keyword: true },
    semicolon:   { type: tokenType.semicolon,   value: ";",   length: 1 },
    ellipsis:    { type: tokenType.ellipsis,    value: "...", length: 3 },
    openParen:   { type: tokenType.openParen,   value: "(",   length: 1 },
    closeParen:  { type: tokenType.closeParen,  value: ")",   length: 1 },
    eof:         { type: tokenType.eof,                       length: 0 }
  };

  function reservedWordLookup(identifier) {
    switch (identifier.charCodeAt(0)) {
    case /*f*/102:
      switch (identifier) {
      case 'fn': return tokens.fnKeyword;
      }
      break;

    case /*i*/105:
      switch (identifier) {
      case 'in': return tokens.inKeyword;
      }
      break;

    case /*l*/108:
      switch (identifier) {
      case 'let': return tokens.letKeyword;
      }
      break;
    }
    return null;
  }

  function isIdentifierStartCharacter(code) {
    switch (code) {
    case (code >= /*a*/97 && code <= /*z*/122) && code:
    case (code >= /*A*/65 && code <= /*Z*/90) && code:
    case /*$*/36:
    case /*_*/95:
      return true;
    default:
      return false;
    }
  }

  function readIdentifierPart(text, offset, limit) {
    while (offset < limit) {
      var code = text.charCodeAt(offset);
      switch (code) {
      case (code >= /*a*/97 && code <= /*z*/122) && code: // (Inlined isIdentifierStartCharacter)
      case (code >= /*A*/65 && code <= /*Z*/90) && code:
      case /*$*/36:
      case /*_*/95:
        break;
      case (code >= /*0*/48 && code <= /*9*/57) && code: // (Inlined isDecimalDigit)
        break;
      default:
        return offset;
      }
      offset++;
    }
    return offset;
  }

  function readIdentifierToken(text, start, offset, limit) {
    offset = readIdentifierPart(text, offset, limit);
    var length = offset - start;

    var value = text.substr(start, length);
    return reservedWordLookup(value) || { type: tokenType.identifier, length: length, value: value, quoted: false };
  }

  function readQuotedIdentifier(text, offset, limit) {
    while (offset < limit) {
      var code = text.charCodeAt(offset);
      switch (code) {
      case /*\*/92:
        offset++;
        if (offset < limit) {
          code = text.charCodeAt(offset);
          if (code != /*]*/93) {
            return -offset;
          }
        }
        break;
      case /*]*/93:
        return offset + 1;
      }
      offset++;
    }
    return -offset;
  }

  function readQuotedIdentifierToken(text, start, offset, limit) {
    offset = readQuotedIdentifier(text, offset, limit);

    var error;
    var type = tokenType.identifier;
    if (offset < 0) {
      offset = -offset;
      type = tokenType.error;
      error = "Expected to find a ']' to close the quoted identifier.";
    }
    var length = offset - start;
    if (length <= 2) {
      type = tokenType.error;
      error = "Empty quoted identifiers ('[]') are not allowed.";
    }

    var value;
    if (type === tokenType.identifier) {
      value = text.substr(start + 1, length - 2).replace(/\\/g, "");
    } else {
      value = text.substr(start, length);
    }

    var result = { type: type, length: length, value: value, quoted: true };
    if (error) { result.error = error; }
    return result;
  }

  function isDecimalDigit(code) {
    return (code >= /*0*/48 && code <= /*9*/57) && code;
  }

  function readDecimalDigits(text, offset, limit) {
    while (offset < limit && isDecimalDigit(text.charCodeAt(offset))) {
      offset++;
    }
    return offset;
  }

  function readDecimalLiteral(text, offset, limit) {
    offset = readDecimalDigits(text, offset, limit);
    if (offset < limit && text.charCodeAt(offset) === /*.*/46 && offset + 1 < limit && isDecimalDigit(text.charCodeAt(offset + 1))) {
      offset = readDecimalDigits(text, offset + 2, limit);
    }
    if (offset < limit) {
      var code = text.charCodeAt(offset);
      if (code === /*e*/101 || code === /*E*/69) {
        var tempOffset = offset + 1;
        if (tempOffset < limit) {
          code = text.charCodeAt(tempOffset);
          if (code === /*+*/43 || code === /*-*/45) {
            tempOffset++;
          }
          offset = readDecimalDigits(text, tempOffset, limit);
        }
      }
    }
    return offset;
  }

  function readDecimalLiteralToken(text, start, offset, limit) {
    offset = readDecimalLiteral(text, offset, limit);
    var length = offset - start;

    return { type: tokenType.numberLiteral, length: length, value: text.substr(start, length) };
  }

  function isWhitespace(code) {
    switch (code) {
    case 0x0009:    // tab
    case 0x000A:    // line feed
    case 0x000B:    // vertical tab
    case 0x000C:    // form feed
    case 0x000D:    // carriage return
    case 0x0020:    // space
    case 0x00A0:    // no-breaking space
    case 0x1680:    // Unicode category Zs follow:
    case 0x180e:
    case (code >= 0x2000 && code <= 0x200a) && code:
    case 0x2028:    // line separator
    case 0x2029:    // paragraph separator
    case 0x202f:
    case 0x205f:
    case 0x3000:
    case 0xFEFF:    // BOM
      return true;

    default:
      return false;
    }
  }

  function readWhitespace(text, offset, limit) {
    while (offset < limit) {
      var code = text.charCodeAt(offset);
      if (!isWhitespace(code)) { return offset; }
      offset++;
    }
    return offset;
  }

  function readWhitespaceToken(text, start, offset, limit) {
    offset = readWhitespace(text, offset);
    var length = offset - start;

    return { type: tokenType.whitespace, length: length, value: text.substr(start, length) };
  }
  
  function lex(text, offset, limit) {
    offset = offset || 0;
    limit = limit || text.length;

    var result = [];
    while (offset < limit) {
      var startOffset = offset;
      var code = text.charCodeAt(offset++);
      var type;
      var token;

      switch (code) {
      case isWhitespace(code) && code:
        token = readWhitespaceToken(text, startOffset, offset, limit);
        break;

      case /*(*/40: token = tokens.openParen; break;
      case /*)*/41: token = tokens.closeParen; break;

      case /* * */42: token = tokens.multiply; break;
      case /* / */47: token = tokens.divide; break;

      case /*+*/43: token = tokens.plus; break;
      case /*-*/45: token = tokens.minus; break;

      case /*.*/46:
        if (offset+1 < limit &&
            text.charCodeAt(offset) === /*.*/46 &&
            text.charCodeAt(offset+1) === /*.*/46) {
          token = tokens.ellipsis;
        } else {
          token = { 
            type: tokenType.error, 
            length: offset - startOffset, 
            value: text.substring(startOffset, offset),
            error: "Unrecognized symbol. (Did you mean '...'?)"
          };
        }
        break;

      case (code >= /*0*/48 && code <= /*9*/57) && code:
        token = readDecimalLiteralToken(text, startOffset, offset, limit);
        break;

      case /*;*/59:
        token = tokens.semicolon;
        break;

      case /*=*/61:
        if (offset < limit && text.charCodeAt(offset) === /*>*/62) {
          token = tokens.arrow;
        } else {
          token = tokens.equals;
        }
        break;

      case /*[*/91:
        token = readQuotedIdentifierToken(text, startOffset, offset, limit);
        break;

      case isIdentifierStartCharacter(code) && code:
        token = readIdentifierToken(text, startOffset, offset, limit);
        break;

      default:
        // TODO: Suppress duplicate error tokens; merge them together. Or resync on whitespace?
        token = { 
          type: tokenType.error, 
          length: offset - startOffset, 
          value: text.substring(startOffset, offset),
          error: "Unrecognized symbol. (Did you mean to quote this as an identifier, with '[]'?)"
        };
        break;
      }

      offset += (token.length - 1);
      result.push(token);
    }
    result.push(tokens.eof);
    return result;
  };

  global.tokenType = tokenType;
  global.tokenTypeName = tokenTypeName;
  global.lex = lex;
})(this);
