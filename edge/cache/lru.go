package cache 


import "sync"


type  Cache struct {
	capacity int64
	used     int64
	items    map[string]*Node
	head     *Node
	tail     *Node
	mu      sync.RWMutex
}


func NewCache(capacity int64) *Cache {
    
	 head := &Node{}
	 tail := &Node{}
	 head.next = tail 
	 tail.prev = head

	return &Cache{
        capacity: capacity,
        items:    make(map[string]*Node),
        head:     head,
        tail:     tail,
	}

}


func (c *Cache) addToFront(node *Node) {
    node.next = c.head.next
    node.prev = c.head
    c.head.next.prev = node
    c.head.next = node
}


func (c *Cache) removeNode(node *Node) {
	node.prev.next = node.next
    node.next.prev = node.prev

}


func (c *Cache) moveToFront(node *Node) {
    c.removeNode(node)
    c.addToFront(node)

}


func (c *Cache) evict() {
    lru := c.tail.prev     
    c.removeNode(lru)
    delete(c.items, lru.key)
    c.used -= lru.size
}


func  (c *Cache) Get(key string) ([]byte, bool) {
	c.mu.Lock()


	defer c.mu.Unlock()

	node, ok := c.items[key]


	if !ok {
		return nil, false
	}

	c.moveToFront(node)
	return node.value, true
}



func (c *Cache) Set(key string, value []byte) {
 
	c.mu.Lock()
	defer c.mu.Unlock()

	size := int64(len(value))
    // key hai ya nahi
        if node, ok := c.items[key]; ok {
        c.used -= node.size
        node.value = value
        node.size = size
        c.used += size
        c.moveToFront(node)
        return
    }


   
    node := &Node{key: key, value: value, size: size}
    c.items[key] = node
    c.addToFront(node)
    c.used += size


	for c.used > c.capacity {
       c.evict()

	}



}


func (c *Cache) Delete(key string) {
    c.mu.Lock()
    defer c.mu.Unlock()

    node, ok := c.items[key]
    if !ok {
        return
    }

    c.removeNode(node)
    delete(c.items, key)
    c.used -= node.size
}




func (c *Cache) Used() int64 { 
    c.mu.RLock()
	defer c.mu.RUnlock()
	return c.used
}

func (c *Cache) Len() int {
    c.mu.RLock()
    defer c.mu.RUnlock()
    return len(c.items)
}



