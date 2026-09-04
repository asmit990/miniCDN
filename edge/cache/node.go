package cache

import (
	"crypto/md5"
	"encoding/hex"
	"time"
)

type Node struct {
	key       string
	value     []byte
	size      int64
	prev      *Node
	next      *Node
	createdAt time.Time
	etag      string
}

func (n *Node) computeETag() {
	sum := md5.Sum(n.value)
	n.etag = `"` + hex.EncodeToString(sum[:]) + `"`
}
