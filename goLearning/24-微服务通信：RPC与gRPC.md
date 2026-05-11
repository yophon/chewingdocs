# 微服务通信：RPC 与 gRPC

> **导读**：HTTP JSON 固然好用，但在内网微服务之间海量高频调用时，序列化慢、无强类型校验的缺点就被放大了。gRPC 是微服务互调的事实标准。

## 一、为什么不用 HTTP/JSON？
- HTTP/1.1 头部冗余大，每次调用都是文本传输。
- JSON 序列化和反序列化极度消耗 CPU（需大量用到反射）。
- 没有代码契约：服务端改了字段，客户端在运行期崩溃才知道。

## 二、gRPC 与 Protobuf 机制
gRPC 底层基于 HTTP/2（支持多路复用和流式传输），序列化采用 **Protobuf (Protocol Buffers)**。
Protobuf 是一种二进制编码，把数据压缩得极小，并提供强类型的 `.proto` 文件作为跨语言的契约。

**1. 编写 `.proto` 契约文件**
```protobuf
syntax = "proto3";
package hello;

// 定义服务
service Greeter {
  rpc SayHello (HelloRequest) returns (HelloReply) {}
}

// 定义消息
message HelloRequest {
  string name = 1; // 1 不是值，而是二进制编码中的字段编号
}
message HelloReply {
  string message = 1;
}
```

**2. 通过工具自动生成 Go 代码**
执行 `protoc` 命令，自动生成强类型的 Go 结构体和 Client/Server 接口。

## 三、服务端与客户端实战
```go
// Server 端实现接口
type server struct {
    pb.UnimplementedGreeterServer
}
func (s *server) SayHello(ctx context.Context, in *pb.HelloRequest) (*pb.HelloReply, error) {
    return &pb.HelloReply{Message: "Hello " + in.GetName()}, nil
}

// 启动 gRPC 服务
lis, _ := net.Listen("tcp", ":50051")
s := grpc.NewServer()
pb.RegisterGreeterServer(s, &server{})
s.Serve(lis)
```
```go
// Client 端调用
conn, _ := grpc.Dial("localhost:50051", grpc.WithInsecure())
defer conn.Close()
c := pb.NewGreeterClient(conn)

// 强类型调用，就像调用本地函数一样
r, err := c.SayHello(context.Background(), &pb.HelloRequest{Name: "Gopher"})
fmt.Println(r.GetMessage())
```
