# 微服务通信：RPC 与 gRPC

> **一句话导读**：微服务之间不是“能 HTTP 调通”就够了，高频内网调用更需要明确契约、超时控制、可观测性和可演进的接口治理。

## 一、先建立通信心智：HTTP API 与 RPC 解决的是不同问题

在单体应用里，函数调用发生在同一个进程内，调用方知道入参、返回值和错误类型。拆成微服务后，调用跨进程、跨机器、跨网络，原来一次普通函数调用会多出这些成本：

- **序列化成本**：请求和响应要编码成字节流，再从字节流解码回来。
- **网络不确定性**：连接可能断开，延迟可能抖动，请求可能超时。
- **契约演进**：服务端字段变更、枚举扩展、错误码调整，都可能影响客户端。
- **治理能力**：重试、熔断、限流、链路追踪、负载均衡都要纳入调用路径。

HTTP/JSON 适合开放 API、调试友好、浏览器和网关生态成熟；RPC 更适合内网服务间的强类型、高频、低延迟调用。gRPC 是 Go 微服务里最常见的 RPC 方案，它把“接口契约”放在 `.proto` 文件里，再生成客户端和服务端代码，让远程调用看起来像本地方法调用。

需要注意：RPC 只是调用形态，不等于自动高可用。一个没有超时、没有观测、没有错误语义的 gRPC 服务，在线上照样会把故障放大。

## 二、gRPC 的架构机制

gRPC 的核心组合是 **HTTP/2 + Protobuf + 代码生成 + 拦截器生态**。

```text
client code
   |
   |  调用生成的强类型 Stub
   v
gRPC client interceptor
   |
   |  Protobuf 编码，HTTP/2 传输
   v
gRPC server interceptor
   |
   |  解码后分发到业务实现
   v
service implementation
```

几个关键机制要抓牢：

- **Protobuf 是契约**：字段名给人看，字段编号才是二进制兼容的核心。上线后不要随意复用旧字段编号。
- **HTTP/2 多路复用**：一个 TCP 连接上可以并发跑多个 stream，连接复用能力比 HTTP/1.1 更好。
- **四种调用模式**：Unary、Server Streaming、Client Streaming、Bidirectional Streaming。
- **Deadline 传播**：调用方应该设置超时，服务端通过 `context.Context` 感知取消。
- **Interceptor 拦截器**：认证、日志、指标、追踪、限流通常放在拦截器里，而不是散落在每个业务方法。

## 三、定义 `.proto` 契约

先定义一个用户服务，包含创建用户和查询用户两个 RPC。真实项目里建议把 proto 放在 `api/proto` 或独立的接口仓库中，避免服务之间直接 import 对方的内部 Go 包。

```protobuf
syntax = "proto3";

package user.v1;

option go_package = "github.com/example/shop/api/user/v1;userv1";

service UserService {
  rpc CreateUser(CreateUserRequest) returns (CreateUserReply);
  rpc GetUser(GetUserRequest) returns (GetUserReply);
}

message CreateUserRequest {
  string name = 1;
  string email = 2;
}

message CreateUserReply {
  int64 id = 1;
}

message GetUserRequest {
  int64 id = 1;
}

message GetUserReply {
  int64 id = 1;
  string name = 2;
  string email = 3;
  UserStatus status = 4;
}

enum UserStatus {
  USER_STATUS_UNSPECIFIED = 0;
  USER_STATUS_ACTIVE = 1;
  USER_STATUS_DISABLED = 2;
}
```

生成 Go 代码：

```bash
go install google.golang.org/protobuf/cmd/protoc-gen-go@latest
go install google.golang.org/grpc/cmd/protoc-gen-go-grpc@latest

protoc \
  --go_out=. --go_opt=paths=source_relative \
  --go-grpc_out=. --go-grpc_opt=paths=source_relative \
  api/user/v1/user.proto
```

生产环境里更推荐用 `buf` 管理 proto 格式化、破坏性变更检查和代码生成：

```yaml
# buf.gen.yaml
version: v2
plugins:
  - remote: buf.build/protocolbuffers/go
    out: .
    opt: paths=source_relative
  - remote: buf.build/grpc/go
    out: .
    opt: paths=source_relative
```

## 四、Go 服务端实现

服务端只需要实现生成出来的接口。业务错误不要直接返回 `fmt.Errorf`，应尽量映射为 gRPC status code，方便调用方做统一处理。

```go
package main

import (
	"context"
	"errors"
	"log"
	"net"
	"time"

	userv1 "github.com/example/shop/api/user/v1"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

type userServer struct {
	userv1.UnimplementedUserServiceServer
	repo *UserRepo
}

func (s *userServer) CreateUser(ctx context.Context, req *userv1.CreateUserRequest) (*userv1.CreateUserReply, error) {
	if req.GetName() == "" || req.GetEmail() == "" {
		return nil, status.Error(codes.InvalidArgument, "name and email are required")
	}

	id, err := s.repo.Create(ctx, req.GetName(), req.GetEmail())
	if err != nil {
		return nil, status.Errorf(codes.Internal, "create user: %v", err)
	}

	return &userv1.CreateUserReply{Id: id}, nil
}

func (s *userServer) GetUser(ctx context.Context, req *userv1.GetUserRequest) (*userv1.GetUserReply, error) {
	u, err := s.repo.Get(ctx, req.GetId())
	if errors.Is(err, ErrNotFound) {
		return nil, status.Error(codes.NotFound, "user not found")
	}
	if err != nil {
		return nil, status.Errorf(codes.Internal, "get user: %v", err)
	}

	return &userv1.GetUserReply{
		Id:     u.ID,
		Name:   u.Name,
		Email:  u.Email,
		Status: userv1.UserStatus_USER_STATUS_ACTIVE,
	}, nil
}

func main() {
	lis, err := net.Listen("tcp", ":50051")
	if err != nil {
		log.Fatal(err)
	}

	server := grpc.NewServer(
		grpc.UnaryInterceptor(loggingInterceptor),
	)

	userv1.RegisterUserServiceServer(server, &userServer{repo: NewUserRepo()})
	log.Fatal(server.Serve(lis))
}

func loggingInterceptor(
	ctx context.Context,
	req any,
	info *grpc.UnaryServerInfo,
	handler grpc.UnaryHandler,
) (any, error) {
	start := time.Now()
	resp, err := handler(ctx, req)
	log.Printf("method=%s cost=%s err=%v", info.FullMethod, time.Since(start), err)
	return resp, err
}
```

## 五、Go 客户端调用：超时、连接和错误处理

客户端最容易犯的错误是不用超时，或者每次请求都 `grpc.Dial` 一次。`ClientConn` 本身是并发安全的，应该在进程内复用。

```go
package userclient

import (
	"context"
	"time"

	userv1 "github.com/example/shop/api/user/v1"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/status"
)

type Client struct {
	conn *grpc.ClientConn
	api  userv1.UserServiceClient
}

func New(addr string) (*Client, error) {
	conn, err := grpc.NewClient(
		addr,
		grpc.WithTransportCredentials(insecure.NewCredentials()),
	)
	if err != nil {
		return nil, err
	}

	return &Client{
		conn: conn,
		api:  userv1.NewUserServiceClient(conn),
	}, nil
}

func (c *Client) Close() error {
	return c.conn.Close()
}

func (c *Client) GetUser(ctx context.Context, id int64) (*userv1.GetUserReply, error) {
	ctx, cancel := context.WithTimeout(ctx, 300*time.Millisecond)
	defer cancel()

	resp, err := c.api.GetUser(ctx, &userv1.GetUserRequest{Id: id})
	if status.Code(err) == codes.NotFound {
		return nil, ErrUserNotFound
	}
	return resp, err
}
```

如果要接入服务发现和负载均衡，可以通过 resolver 或 xDS；小团队也可以先用 Kubernetes Service 做 L4 负载均衡，但要知道 HTTP/2 长连接可能导致连接级负载不均，必要时配置客户端轮询、连接池或服务网格。

## 六、流式 RPC：什么时候需要 Streaming

Unary RPC 是一次请求一次响应，适合大多数 CRUD。Streaming 适合持续数据流：

- 服务端流：导出大量数据、持续推送日志。
- 客户端流：上传分片、批量写入。
- 双向流：实时协作、聊天、网关转发。

服务端流示例：

```protobuf
service ReportService {
  rpc WatchJob(WatchJobRequest) returns (stream JobEvent);
}

message WatchJobRequest {
  string job_id = 1;
}

message JobEvent {
  string stage = 1;
  string message = 2;
}
```

```go
func (s *reportServer) WatchJob(
	req *reportv1.WatchJobRequest,
	stream reportv1.ReportService_WatchJobServer,
) error {
	ticker := time.NewTicker(time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-stream.Context().Done():
			return stream.Context().Err()
		case <-ticker.C:
			event, done := s.jobs.Progress(req.GetJobId())
			if err := stream.Send(event); err != nil {
				return err
			}
			if done {
				return nil
			}
		}
	}
}
```

Streaming 的生产取舍是：它能减少轮询和请求开销，但会让连接生命周期更长，服务端需要严格处理取消、限流、心跳和背压。

## 七、排错与优化

gRPC 线上问题通常不是“服务起不来”，而是延迟、超时、连接和协议兼容问题。

常用排查方法：

- **先看错误码**：`codes.DeadlineExceeded` 是调用方超时，`codes.Unavailable` 常见于连接失败、服务不可达或重启。
- **使用 grpcurl 调试**：没有客户端代码也能调用服务。

```bash
grpcurl -plaintext localhost:50051 list
grpcurl -plaintext -d '{"id": 1}' localhost:50051 user.v1.UserService/GetUser
```

- **打开健康检查**：让负载均衡器知道服务是否可用。

```go
import healthgrpc "google.golang.org/grpc/health/grpc_health_v1"
import "google.golang.org/grpc/health"

hs := health.NewServer()
healthgrpc.RegisterHealthServer(server, hs)
hs.SetServingStatus("", healthgrpc.HealthCheckResponse_SERVING)
```

- **限制消息大小**：避免一次 RPC 把内存打爆。

```go
server := grpc.NewServer(
	grpc.MaxRecvMsgSize(4<<20),
	grpc.MaxSendMsgSize(4<<20),
)
```

- **观测每个方法的 P95/P99**：平均值意义有限，尾延迟才会决定用户体验和级联故障风险。
- **关注 proto 兼容性**：新增字段通常安全；删除字段要保留编号；枚举要保留 `0` 作为 unspecified。

## 八、生产取舍

gRPC 很适合内部服务调用，但不是所有场景都要上 gRPC。

适合使用 gRPC 的场景：

- Go、Java、Node 等多语言服务之间需要强类型契约。
- 内网调用频繁，延迟和序列化成本敏感。
- 需要 streaming、deadline、metadata、拦截器等 RPC 能力。
- 接口主要给服务调用，而不是直接给浏览器调用。

不一定适合的场景：

- 面向公网开放给第三方开发者，REST/JSON 的调试成本更低。
- 团队缺少 proto 治理，接口经常破坏性变更。
- 业务主要是简单后台管理 CRUD，引入 gRPC 会增加工具链成本。

一种常见架构是：外部使用 HTTP/JSON 或 GraphQL，内部服务间使用 gRPC，边界处通过 API Gateway 或 BFF 做协议转换。

## 九、总结

gRPC 的价值不是“比 HTTP 快”这么简单，而是把服务间调用变成一套可治理的工程体系：用 Protobuf 管契约，用 HTTP/2 提升连接效率，用 context 传递超时和取消，用 status code 表达错误语义，用 interceptor 承载观测和治理。

写好 gRPC 服务的底线是：契约要可演进，客户端要有超时，服务端要尊重取消，错误码要稳定，指标和日志要能定位问题。做到这些，RPC 才会从“远程函数调用的幻觉”变成可长期维护的微服务基础设施。
