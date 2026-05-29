package cache

type Node struct {
    key   string
    value []byte
    size  int64
    prev  *Node
    next  *Node
}