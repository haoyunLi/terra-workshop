// Little-endian reader over the decrypted player file, with the error position for messages.

export class FormatError extends Error {
  /** byte offset in the decrypted data where reading failed */
           offset        
  constructor(message        , offset        ) {
    super(`${message} (at byte ${offset})`)
    this.name = 'FormatError'
    this.offset = offset
  }
}

const utf8 = new TextDecoder('utf-8')

export class Reader {
  pos = 0
                   view          
                   bytes            

  constructor(bytes            ) {
    this.bytes = bytes
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  }

  get remaining()         {
    return this.bytes.length - this.pos
  }

          need(n        ) {
    if (this.pos + n > this.bytes.length) throw new FormatError('unexpected end of file', this.pos)
  }

  u8()         {
    this.need(1)
    return this.bytes[this.pos++]
  }

  bool()          {
    return this.u8() !== 0
  }

  u16()         {
    this.need(2)
    const v = this.view.getUint16(this.pos, true)
    this.pos += 2
    return v
  }

  i32()         {
    this.need(4)
    const v = this.view.getInt32(this.pos, true)
    this.pos += 4
    return v
  }

  u32()         {
    this.need(4)
    const v = this.view.getUint32(this.pos, true)
    this.pos += 4
    return v
  }

  i64()         {
    this.need(8)
    const v = this.view.getBigInt64(this.pos, true)
    this.pos += 8
    return v
  }

  bytesOf(n        )             {
    this.need(n)
    const v = this.bytes.subarray(this.pos, this.pos + n)
    this.pos += n
    return v
  }

  skip(n        ) {
    this.need(n)
    this.pos += n
  }

  /** .NET BinaryWriter string: length as 7-bit encoded integer, then UTF-8 bytes. */
  string()         {
    let length = 0
    let shift = 0
    for (;;) {
      if (shift > 28) throw new FormatError('invalid string length', this.pos)
      const b = this.u8()
      length |= (b & 0x7f) << shift
      if (!(b & 0x80)) break
      shift += 7
    }
    return utf8.decode(this.bytesOf(length))
  }
}
